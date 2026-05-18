import type { CommandResult, RepoSource } from "@ai-fix-runner/shared";

export interface Workspace {
  id: string;
  rootDir: string;
  source: RepoSource;
}

export interface RunCommandOptions {
  timeoutMs: number;
  env?: Record<string, string>;
}

/**
 * Runner abstracts away *where* commands run. In Test 1 the only implementation
 * is LocalRunner (host filesystem + child_process.spawn). In Test 2 a
 * TensorlakeRunner will implement the same interface against Tensorlake Sandbox.
 * The repair loop, patch applier, repair engines, and routes must all depend
 * on this interface only — never on child_process, fs, or any host path
 * directly — so the swap is a single binding change in index.ts.
 */
export interface Runner {
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
