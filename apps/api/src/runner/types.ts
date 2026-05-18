import type {
  CleanupStatus,
  CommandResult,
  RepoSource,
  RunnerKind,
} from "@ai-fix-runner/shared";
import type { Sandbox } from "tensorlake";

/**
 * Workspaces are discriminated by where the repo physically lives. LocalRunner
 * works under `rootDir` on the host filesystem; TensorlakeRunner keeps a live
 * Sandbox handle and works under `remoteRoot` inside the sandbox. Both expose
 * `rootDir` so callers that only need a label (for logging) don't have to
 * branch on `kind`.
 */
export type Workspace = LocalWorkspace | TensorlakeWorkspace;

export interface LocalWorkspace {
  kind: "local";
  id: string;
  rootDir: string;
  source: RepoSource;
}

export interface TensorlakeWorkspace {
  kind: "tensorlake";
  id: string;
  rootDir: string; // mirrors remoteRoot so generic logging works
  source: RepoSource;
  sandbox: Sandbox;
  sandboxId: string;
  sandboxName: string | null;
  image: string | null;
  remoteRoot: string;
  createdAt: string;
  cleanupStatus: CleanupStatus | null;
}

export interface RunCommandOptions {
  timeoutMs: number;
  env?: Record<string, string>;
}

/**
 * Runner abstracts away *where* commands run. LocalRunner uses
 * child_process.spawn on the host; TensorlakeRunner uses the Tensorlake
 * Sandbox SDK. The repair loop, patch applier, repair engines, and routes all
 * depend on this interface only — never on child_process, fs, the tensorlake
 * SDK, or any host/remote path directly.
 */
export interface Runner {
  readonly kind: RunnerKind;
  prepareWorkspace(source: RepoSource, runId: string): Promise<Workspace>;
  runCommand(
    workspace: Workspace,
    command: string,
    args: string[],
    options: RunCommandOptions,
  ): Promise<CommandResult>;
  readFile(workspace: Workspace, relPath: string): Promise<string>;
  writeFile(
    workspace: Workspace,
    relPath: string,
    content: string,
  ): Promise<void>;
  listFiles(workspace: Workspace): Promise<string[]>;
  cleanup(workspace: Workspace): Promise<void>;
}
