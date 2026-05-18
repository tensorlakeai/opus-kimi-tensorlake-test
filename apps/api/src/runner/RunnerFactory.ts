import type { RunnerKind } from "@ai-fix-runner/shared";
import type { AppConfig } from "../config.js";
import { LocalRunner } from "./LocalRunner.js";
import { TensorlakeRunner } from "./TensorlakeRunner.js";
import type { Runner } from "./types.js";

export class TensorlakeNotConfiguredError extends Error {
  constructor() {
    super("Tensorlake runner not configured (TENSORLAKE_API_KEY is not set).");
    this.name = "TensorlakeNotConfiguredError";
  }
}

export interface RunnerFactory {
  create(kind: RunnerKind): Runner;
}

/**
 * Builds a fresh runner per request. LocalRunner is always available;
 * TensorlakeRunner requires TENSORLAKE_API_KEY. Throws a typed error when
 * tensorlake is requested but not configured so the route layer can return
 * a clean 400 rather than 500.
 */
export function createRunnerFactory(cfg: AppConfig): RunnerFactory {
  return {
    create(kind: RunnerKind): Runner {
      if (kind === "local") {
        return new LocalRunner({
          workspaceRoot: cfg.workspaceRoot,
          fixturesRoot: cfg.fixturesRoot,
          uploadRoot: cfg.uploadRoot,
          maxStdioBytes: cfg.maxStdioBytes,
          allowCustomRepoPaths: cfg.allowCustomRepoPaths,
          keepWorkspaces: cfg.keepWorkspaces,
          commandAllowlist: cfg.commandAllowlist,
        });
      }
      if (kind === "tensorlake") {
        if (!cfg.tensorlake.configured || !cfg.tensorlake.apiKey) {
          throw new TensorlakeNotConfiguredError();
        }
        return new TensorlakeRunner({
          apiKey: cfg.tensorlake.apiKey,
          fixturesRoot: cfg.fixturesRoot,
          uploadRoot: cfg.uploadRoot,
          allowCustomRepoPaths: cfg.allowCustomRepoPaths,
          maxStdioBytes: cfg.maxStdioBytes,
          commandAllowlist: cfg.commandAllowlist,
          defaultImage: cfg.tensorlake.defaultImage,
          cpus: cfg.tensorlake.cpus,
          memoryMb: cfg.tensorlake.memoryMb,
          diskMb: cfg.tensorlake.diskMb,
          timeoutSeconds: cfg.tensorlake.timeoutSeconds,
          keepSandboxes: cfg.tensorlake.keepSandboxes,
          remoteRoot: cfg.tensorlake.remoteRoot,
          useNamedSandboxes: cfg.tensorlake.useNamedSandboxes,
          sandboxNamePrefix: cfg.tensorlake.sandboxNamePrefix,
        });
      }
      throw new Error(`Unknown runner kind: ${kind as string}`);
    },
  };
}
