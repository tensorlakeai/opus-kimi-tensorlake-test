import crypto from "node:crypto";
import type { CommandResult, RepoSource } from "@ai-fix-runner/shared";
import { Sandbox } from "tensorlake";
import { joinSandboxPath, posixDirname } from "../util/sandboxPaths.js";
import { walkRepo } from "../util/repoWalker.js";
import { resolveSource } from "../util/sourceResolver.js";
import type {
  Runner,
  RunCommandOptions,
  TensorlakeWorkspace,
  Workspace,
} from "./types.js";

export interface TensorlakeRunnerOptions {
  apiKey: string;
  fixturesRoot: string;
  uploadRoot: string;
  allowCustomRepoPaths: boolean;
  maxStdioBytes: number;
  commandAllowlist: ReadonlySet<string>;
  defaultImage: string | undefined;
  cpus: number | undefined;
  memoryMb: number | undefined;
  diskMb: number | undefined;
  timeoutSeconds: number;
  keepSandboxes: boolean;
  remoteRoot: string;
  useNamedSandboxes: boolean;
  sandboxNamePrefix: string;
}

export class TensorlakeRunner implements Runner {
  readonly kind = "tensorlake" as const;

  constructor(private readonly opts: TensorlakeRunnerOptions) {}

  async prepareWorkspace(
    source: RepoSource,
    runId: string,
  ): Promise<TensorlakeWorkspace> {
    const { absDir } = await resolveSource(source, {
      fixturesRoot: this.opts.fixturesRoot,
      uploadRoot: this.opts.uploadRoot,
      allowCustomRepoPaths: this.opts.allowCustomRepoPaths,
    });

    const sandboxName = this.opts.useNamedSandboxes
      ? `${this.opts.sandboxNamePrefix}-${runId.slice(0, 8)}-${crypto
          .randomBytes(2)
          .toString("hex")}`
      : null;

    const createOpts: Record<string, unknown> = {
      apiKey: this.opts.apiKey,
      timeoutSecs: this.opts.timeoutSeconds,
    };
    if (this.opts.defaultImage) createOpts.image = this.opts.defaultImage;
    if (this.opts.cpus !== undefined) createOpts.cpus = this.opts.cpus;
    if (this.opts.memoryMb !== undefined)
      createOpts.memoryMb = this.opts.memoryMb;
    if (this.opts.diskMb !== undefined) createOpts.diskMb = this.opts.diskMb;
    if (sandboxName) createOpts.name = sandboxName;

    const sandbox = await Sandbox.create(createOpts);
    const createdAt = new Date().toISOString();
    const remoteRoot = this.opts.remoteRoot;

    try {
      // Create the remote workspace root. mkdir -p is safe to re-run.
      const mkdir = await sandbox.run("mkdir", {
        args: ["-p", remoteRoot],
        timeout: 30,
      });
      if (mkdir.exitCode !== 0) {
        throw new Error(
          `Failed to create remote workspace at ${remoteRoot}: ${mkdir.stderr || mkdir.stdout}`,
        );
      }

      // Upload the repo file-by-file. The repoWalker excludes
      // node_modules/.git/.env/*.log so we send only meaningful sources.
      let uploaded = 0;
      for await (const file of walkRepo(absDir)) {
        const remotePath = joinSandboxPath(remoteRoot, file.relPath);
        const dir = posixDirname(remotePath);
        if (dir !== remoteRoot) {
          await sandbox.run("mkdir", {
            args: ["-p", dir],
            timeout: 30,
          });
        }
        await sandbox.writeFile(remotePath, new Uint8Array(file.bytes));
        uploaded++;
      }
      if (uploaded === 0) {
        throw new Error(
          `Source directory ${absDir} contained no uploadable files`,
        );
      }

      // Sanity check: package.json must be present at the remote root.
      const probe = await sandbox.run("test", {
        args: ["-f", `${remoteRoot}/package.json`],
        timeout: 10,
      });
      if (probe.exitCode !== 0) {
        throw new Error(
          `package.json missing in sandbox at ${remoteRoot}; upload incomplete`,
        );
      }
    } catch (err) {
      // Don't leak a sandbox on a setup failure.
      await safeTerminate(sandbox);
      throw err;
    }

    return {
      kind: "tensorlake",
      id: runId,
      rootDir: remoteRoot,
      source,
      sandbox,
      sandboxId: sandbox.sandboxId,
      sandboxName,
      image: this.opts.defaultImage ?? null,
      remoteRoot,
      createdAt,
      cleanupStatus: null,
    };
  }

  async runCommand(
    workspace: Workspace,
    command: string,
    args: string[],
    options: RunCommandOptions,
  ): Promise<CommandResult> {
    if (workspace.kind !== "tensorlake") {
      throw new Error("TensorlakeRunner received a non-tensorlake workspace");
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
    const timeoutSecs = Math.max(1, Math.ceil(options.timeoutMs / 1000));

    let exitCode: number | null = null;
    let signal: string | null = null;
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    try {
      const result = await workspace.sandbox.run(command, {
        args,
        workingDir: workspace.remoteRoot,
        timeout: timeoutSecs,
        env: options.env,
      });
      stdout = result.stdout ?? "";
      stderr = result.stderr ?? "";
      // The SDK encodes signal exits as a negative exitCode (= -signal). See
      // tensorlake/typescript/src/sandbox.ts line 610.
      if (result.exitCode < 0) {
        signal = signalNumberToName(-result.exitCode);
        exitCode = null;
      } else {
        exitCode = result.exitCode;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const finishedAt = new Date();
      const duration = finishedAt.getTime() - startedAt.getTime();
      // The SDK will throw when the per-request timeout kicks in. We treat any
      // error that crossed our requested wall-clock budget as a timeout; other
      // errors are surfaced via stderr so the run is recorded clearly.
      if (duration >= options.timeoutMs - 250) {
        timedOut = true;
        stderr = `${stderr}\n[tensorlake] command timed out after ${timeoutSecs}s: ${msg}`;
      } else {
        stderr = `${stderr}\n[tensorlake] runtime error: ${msg}`;
      }
    }

    const finishedAt = new Date();
    const { stdout: cappedStdout, truncated: stdoutTrunc } = capString(
      stdout,
      this.opts.maxStdioBytes,
    );
    const { stdout: cappedStderr, truncated: stderrTrunc } = capString(
      stderr,
      this.opts.maxStdioBytes,
    );

    const success = !timedOut && exitCode === 0;

    return {
      command,
      args,
      cwd: workspace.remoteRoot,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      exitCode,
      signal,
      stdout: cappedStdout,
      stderr: cappedStderr,
      timedOut,
      truncated: stdoutTrunc || stderrTrunc,
      success,
      runner: "tensorlake",
      sandboxId: workspace.sandboxId,
    };
  }

  async readFile(workspace: Workspace, relPath: string): Promise<string> {
    if (workspace.kind !== "tensorlake") {
      throw new Error("TensorlakeRunner received a non-tensorlake workspace");
    }
    const remotePath = joinSandboxPath(workspace.remoteRoot, relPath);
    const bytes = await workspace.sandbox.readFile(remotePath);
    return new TextDecoder().decode(bytes);
  }

  async writeFile(
    workspace: Workspace,
    relPath: string,
    content: string,
  ): Promise<void> {
    if (workspace.kind !== "tensorlake") {
      throw new Error("TensorlakeRunner received a non-tensorlake workspace");
    }
    const remotePath = joinSandboxPath(workspace.remoteRoot, relPath);
    const dir = posixDirname(remotePath);
    if (dir !== workspace.remoteRoot) {
      const mk = await workspace.sandbox.run("mkdir", {
        args: ["-p", dir],
        timeout: 30,
      });
      if (mk.exitCode !== 0) {
        throw new Error(
          `Failed to create remote parent dir ${dir}: ${mk.stderr || mk.stdout}`,
        );
      }
    }
    await workspace.sandbox.writeFile(
      remotePath,
      new TextEncoder().encode(content),
    );
  }

  async listFiles(workspace: Workspace): Promise<string[]> {
    if (workspace.kind !== "tensorlake") {
      throw new Error("TensorlakeRunner received a non-tensorlake workspace");
    }
    const out: string[] = [];
    const skip = new Set(["node_modules", ".git"]);
    const root = workspace.remoteRoot.replace(/\/+$/, "");
    const stack: string[] = [root];
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      let listing;
      try {
        listing = await workspace.sandbox.listDirectory(dir);
      } catch {
        continue;
      }
      for (const entry of listing.entries ?? []) {
        if (skip.has(entry.name)) continue;
        const full = `${dir}/${entry.name}`;
        if (entry.isDir) {
          stack.push(full);
        } else {
          const rel = full.slice(root.length + 1);
          out.push(rel);
        }
      }
    }
    return out.sort();
  }

  async cleanup(workspace: Workspace): Promise<void> {
    if (workspace.kind !== "tensorlake") return;
    if (this.opts.keepSandboxes) {
      workspace.cleanupStatus = "kept";
      return;
    }
    try {
      await workspace.sandbox.terminate();
      workspace.cleanupStatus = "terminated";
    } catch (err) {
      workspace.cleanupStatus = "failed";
      // Log but don't rethrow — cleanup failure must not crash the run loop.
      console.error(
        `[tensorlake] cleanup failed for ${workspace.sandboxId}:`,
        err,
      );
    }
  }
}

async function safeTerminate(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.terminate();
  } catch {
    // best-effort; the sandbox will eventually time out on its own
  }
}

function capString(
  s: string,
  maxBytes: number,
): { stdout: string; truncated: boolean } {
  // The SDK already buffers and returns a string. We measure by UTF-8 byte
  // length to stay consistent with LocalRunner's cap.
  const buf = Buffer.from(s, "utf8");
  if (buf.byteLength <= maxBytes) return { stdout: s, truncated: false };
  return {
    stdout:
      buf.subarray(0, maxBytes).toString("utf8") +
      `\n[truncated at ${maxBytes} bytes]\n`,
    truncated: true,
  };
}

const SIGNAL_NAMES: Record<number, string> = {
  1: "SIGHUP",
  2: "SIGINT",
  3: "SIGQUIT",
  6: "SIGABRT",
  9: "SIGKILL",
  11: "SIGSEGV",
  13: "SIGPIPE",
  14: "SIGALRM",
  15: "SIGTERM",
};

function signalNumberToName(n: number): string {
  return SIGNAL_NAMES[n] ?? `SIG${n}`;
}
