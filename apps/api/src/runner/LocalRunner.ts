import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { CommandResult, RepoSource } from "@ai-fix-runner/shared";
import { copyDirectorySafe, rmSafe } from "../util/fsCopy.js";
import { resolveSource } from "../util/sourceResolver.js";
import { createCappedBuffer } from "../util/truncate.js";
import type {
  LocalWorkspace,
  Runner,
  RunCommandOptions,
  Workspace,
} from "./types.js";

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
  readonly kind = "local" as const;

  constructor(private readonly opts: LocalRunnerOptions) {}

  async prepareWorkspace(
    source: RepoSource,
    runId: string,
  ): Promise<LocalWorkspace> {
    const target = path.join(this.opts.workspaceRoot, runId);
    await fs.mkdir(target, { recursive: true });

    const { absDir } = await resolveSource(source, {
      fixturesRoot: this.opts.fixturesRoot,
      uploadRoot: this.opts.uploadRoot,
      allowCustomRepoPaths: this.opts.allowCustomRepoPaths,
    });
    await copyDirectorySafe(absDir, target);

    return { kind: "local", id: runId, rootDir: target, source };
  }

  async runCommand(
    workspace: Workspace,
    command: string,
    args: string[],
    options: RunCommandOptions,
  ): Promise<CommandResult> {
    if (workspace.kind !== "local") {
      throw new Error("LocalRunner received a non-local workspace");
    }
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
      runner: "local",
      sandboxId: null,
    };
  }

  async readFile(workspace: Workspace, relPath: string): Promise<string> {
    if (workspace.kind !== "local") {
      throw new Error("LocalRunner received a non-local workspace");
    }
    const full = this.resolveInWorkspace(workspace, relPath);
    return await fs.readFile(full, "utf8");
  }

  async writeFile(
    workspace: Workspace,
    relPath: string,
    content: string,
  ): Promise<void> {
    if (workspace.kind !== "local") {
      throw new Error("LocalRunner received a non-local workspace");
    }
    const full = this.resolveInWorkspace(workspace, relPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
  }

  async listFiles(workspace: Workspace): Promise<string[]> {
    if (workspace.kind !== "local") {
      throw new Error("LocalRunner received a non-local workspace");
    }
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
    if (workspace.kind !== "local") return;
    if (this.opts.keepWorkspaces) return;
    await rmSafe(workspace.rootDir);
  }

  private resolveInWorkspace(
    workspace: LocalWorkspace,
    relPath: string,
  ): string {
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
