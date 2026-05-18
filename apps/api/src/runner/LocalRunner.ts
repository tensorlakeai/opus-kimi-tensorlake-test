import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { CommandResult, RepoSource } from "@ai-fix-runner/shared";
import { copyDirectorySafe, rmSafe } from "../util/fsCopy.js";
import { createCappedBuffer } from "../util/truncate.js";
import type { Runner, RunCommandOptions, Workspace } from "./types.js";

export interface LocalRunnerOptions {
  workspaceRoot: string;
  fixturesRoot: string;
  uploadRoot: string;
  maxStdioBytes: number;
  allowCustomRepoPaths: boolean;
  keepWorkspaces: boolean;
  commandAllowlist: ReadonlySet<string>;
}

export class LocalRunner implements Runner {
  constructor(private readonly opts: LocalRunnerOptions) {}

  async prepareWorkspace(
    source: RepoSource,
    runId: string,
  ): Promise<Workspace> {
    const target = path.join(this.opts.workspaceRoot, runId);
    await fs.mkdir(target, { recursive: true });

    const sourceDir = await this.resolveSourceDir(source);
    await copyDirectorySafe(sourceDir, target);

    return { id: runId, rootDir: target, source };
  }

  private async resolveSourceDir(source: RepoSource): Promise<string> {
    if (source.type === "fixture") {
      const dir = path.join(this.opts.fixturesRoot, source.fixtureId);
      await assertDir(dir, `Unknown fixture: ${source.fixtureId}`);
      const fixturesRoot = path.resolve(this.opts.fixturesRoot);
      const resolved = path.resolve(dir);
      if (!resolved.startsWith(fixturesRoot + path.sep)) {
        throw new Error(`Fixture id escapes fixtures root`);
      }
      return resolved;
    }
    if (source.type === "localPath") {
      if (!this.opts.allowCustomRepoPaths) {
        throw new Error(
          "Local-path sources are disabled. Set ALLOW_CUSTOM_REPO_PATHS=true to enable.",
        );
      }
      const resolved = path.resolve(source.path);
      await assertDir(resolved, `localPath does not exist: ${resolved}`);
      return resolved;
    }
    if (source.type === "upload") {
      const dir = path.join(this.opts.uploadRoot, source.uploadId);
      await assertDir(dir, `Unknown upload: ${source.uploadId}`);
      const uploadsRoot = path.resolve(this.opts.uploadRoot);
      const resolved = path.resolve(dir);
      if (!resolved.startsWith(uploadsRoot + path.sep)) {
        throw new Error(`Upload id escapes upload root`);
      }
      return resolved;
    }
    throw new Error(`Unsupported source type`);
  }

  async runCommand(
    workspace: Workspace,
    command: string,
    args: string[],
    options: RunCommandOptions,
  ): Promise<CommandResult> {
    if (!this.opts.commandAllowlist.has(command)) {
      throw new Error(
        `Command not in allowlist: ${command}. Allowed: ${[...this.opts.commandAllowlist].join(", ")}`,
      );
    }
    for (const arg of args) {
      if (typeof arg !== "string") {
        throw new Error("All command args must be strings");
      }
    }

    const startedAt = new Date();
    const stdoutBuf = createCappedBuffer(this.opts.maxStdioBytes);
    const stderrBuf = createCappedBuffer(this.opts.maxStdioBytes);

    // shell: false, env without the host's secrets leaking by accident is hard,
    // so we pass through the env but explicitly null out potentially sensitive vars.
    const env = { ...process.env, ...options.env };
    delete env.NODE_OPTIONS;

    const child = spawn(command, args, {
      cwd: workspace.rootDir,
      shell: false,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore — process likely already gone
      }
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => stdoutBuf.append(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrBuf.append(chunk));

    const exitInfo = await new Promise<{
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve) => {
      child.on("error", (err) => {
        stderrBuf.append(Buffer.from(`\nspawn error: ${err.message}\n`));
        resolve({ exitCode: null, signal: null });
      });
      child.on("close", (code, signal) => {
        resolve({ exitCode: code, signal });
      });
    });

    clearTimeout(timer);
    const finishedAt = new Date();

    const truncated = stdoutBuf.truncated() || stderrBuf.truncated();
    const success = !timedOut && exitInfo.exitCode === 0;

    return {
      command,
      args,
      cwd: workspace.rootDir,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      exitCode: exitInfo.exitCode,
      signal: exitInfo.signal,
      stdout: stdoutBuf.value(),
      stderr: stderrBuf.value(),
      timedOut,
      truncated,
      success,
    };
  }

  async readFile(workspace: Workspace, relPath: string): Promise<string> {
    const full = this.resolveInWorkspace(workspace, relPath);
    return await fs.readFile(full, "utf8");
  }

  async writeFile(
    workspace: Workspace,
    relPath: string,
    content: string,
  ): Promise<void> {
    const full = this.resolveInWorkspace(workspace, relPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
  }

  async listFiles(workspace: Workspace): Promise<string[]> {
    const results: string[] = [];
    const skip = new Set(["node_modules", ".git"]);
    const root = workspace.rootDir;
    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          results.push(path.relative(root, full));
        }
      }
    }
    await walk(root);
    return results.sort();
  }

  async cleanup(workspace: Workspace): Promise<void> {
    if (this.opts.keepWorkspaces) return;
    await rmSafe(workspace.rootDir);
  }

  private resolveInWorkspace(workspace: Workspace, relPath: string): string {
    if (path.isAbsolute(relPath)) {
      throw new Error(`Refusing absolute path: ${relPath}`);
    }
    if (relPath.includes("..")) {
      throw new Error(`Refusing path with '..': ${relPath}`);
    }
    const root = path.resolve(workspace.rootDir);
    const full = path.resolve(root, relPath);
    if (!full.startsWith(root + path.sep) && full !== root) {
      throw new Error(`Path escapes workspace: ${relPath}`);
    }
    return full;
  }
}

async function assertDir(dir: string, msg: string): Promise<void> {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) throw new Error(msg);
  } catch {
    throw new Error(msg);
  }
}
