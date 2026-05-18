import { randomUUID } from "node:crypto";
import type {
  CommandsConfig,
  RepoSource,
} from "@ai-fix-runner/shared";
import { PatchApplier } from "../patches/PatchApplier.js";
import type { RepairEngine, RepairInput } from "../repair/types.js";
import type { Runner, Workspace } from "../runner/types.js";
import type { RunStore } from "../db/RunStore.js";

export interface RepairLoopDeps {
  repairEngine: RepairEngine;
  patchApplier: PatchApplier;
  runStore: RunStore;
  timeouts: {
    installMs: number;
    testMs: number;
    buildMs: number;
  };
}

export interface RepairLoopRequest {
  runner: Runner;
  runId: string;
  source: RepoSource;
  maxAttempts: number;
  commands: CommandsConfig;
  runBuildAfterTestsPass: boolean;
  fixtureId: string | null;
}

const RELEVANT_FILE_GLOBS = [
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
];

/**
 * The repair loop depends only on Runner, RepairEngine, PatchApplier, and
 * RunStore interfaces. The runner is passed per request so the same loop
 * serves both LocalRunner and TensorlakeRunner runs.
 */
export class RepairLoop {
  constructor(private readonly deps: RepairLoopDeps) {}

  async run(req: RepairLoopRequest): Promise<void> {
    const { repairEngine, patchApplier, runStore, timeouts } = this.deps;
    const runner = req.runner;

    runStore.markRunRunning(req.runId);
    let workspace: Workspace | null = null;
    const allChangedFiles = new Set<string>();

    try {
      workspace = await runner.prepareWorkspace(req.source, req.runId);

      if (workspace.kind === "tensorlake") {
        runStore.attachRunnerMetadata(req.runId, {
          sandboxId: workspace.sandboxId,
          sandboxName: workspace.sandboxName,
          image: workspace.image,
          remoteRoot: workspace.remoteRoot,
        });
      }

      // -- install --
      const installAttempt = runStore.createAttempt({
        runId: req.runId,
        attemptNumber: 0,
        phase: "install",
      });
      const installResult = await runner.runCommand(
        workspace,
        req.commands.install[0],
        req.commands.install.slice(1),
        { timeoutMs: timeouts.installMs },
      );
      runStore.recordCommand(installAttempt.id, installResult);
      runStore.completeAttempt(
        installAttempt.id,
        installResult.success ? "passed" : "failed",
      );
      if (!installResult.success) {
        runStore.completeRun(req.runId, "failed", {
          finalStatus: "failed",
          errorMessage: installResult.timedOut
            ? `Install timed out after ${timeouts.installMs}ms`
            : `Install failed with exit code ${installResult.exitCode}`,
          changedFiles: [],
        });
        return;
      }

      // -- repair loop --
      for (let attemptNumber = 1; attemptNumber <= req.maxAttempts; attemptNumber++) {
        const phase = attemptNumber === 1 ? "initial_test" : "after_patch";
        const attempt = runStore.createAttempt({
          runId: req.runId,
          attemptNumber,
          phase,
        });

        const testResult = await runner.runCommand(
          workspace,
          req.commands.test[0],
          req.commands.test.slice(1),
          { timeoutMs: timeouts.testMs },
        );
        runStore.recordCommand(attempt.id, testResult);

        if (testResult.success) {
          runStore.completeAttempt(attempt.id, "passed");

          if (req.runBuildAfterTestsPass) {
            const buildAttempt = runStore.createAttempt({
              runId: req.runId,
              attemptNumber: attemptNumber + 1,
              phase: "build",
            });
            const buildResult = await runner.runCommand(
              workspace,
              req.commands.build[0],
              req.commands.build.slice(1),
              { timeoutMs: timeouts.buildMs },
            );
            runStore.recordCommand(buildAttempt.id, buildResult);
            runStore.completeAttempt(
              buildAttempt.id,
              buildResult.success ? "passed" : "failed",
            );
            if (buildResult.success) {
              runStore.completeRun(req.runId, "passed", {
                finalStatus: "passed",
                changedFiles: [...allChangedFiles],
              });
            } else {
              runStore.completeRun(req.runId, "failed", {
                finalStatus: "failed",
                errorMessage: buildResult.timedOut
                  ? `Build timed out after ${timeouts.buildMs}ms`
                  : `Build failed with exit code ${buildResult.exitCode}`,
                changedFiles: [...allChangedFiles],
              });
            }
          } else {
            runStore.completeRun(req.runId, "passed", {
              finalStatus: "passed",
              changedFiles: [...allChangedFiles],
            });
          }
          return;
        }

        // Test failed → ask repair engine for a patch
        const relevantFiles = await this.gatherRelevantFiles(workspace, runner);
        const repairInput: RepairInput = {
          fixtureId: req.fixtureId,
          attemptNumber,
          failingCommand: testResult,
          relevantFiles,
        };
        const proposal = await repairEngine.proposePatch(repairInput);

        if (proposal.kind === "no_patch") {
          runStore.completeAttempt(attempt.id, "failed");
          runStore.completeRun(req.runId, "failed", {
            finalStatus: "failed",
            errorMessage: proposal.message,
            changedFiles: [...allChangedFiles],
          });
          return;
        }

        const applied = await patchApplier.applyValidated(
          runner,
          workspace,
          proposal,
        );
        for (const f of applied.changedFiles) allChangedFiles.add(f);
        runStore.attachPatchToAttempt(attempt.id, {
          summary: applied.summary,
          changedFiles: applied.changedFiles,
        });
        runStore.completeAttempt(attempt.id, "failed");
        // Loop continues; next iteration is phase = after_patch
      }

      // Exhausted max attempts
      runStore.completeRun(req.runId, "failed", {
        finalStatus: "failed",
        errorMessage: `Tests still failing after ${req.maxAttempts} repair attempts`,
        changedFiles: [...allChangedFiles],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      runStore.completeRun(req.runId, "error", {
        finalStatus: "error",
        errorMessage: message,
        changedFiles: [...allChangedFiles],
      });
    } finally {
      if (workspace) {
        try {
          await runner.cleanup(workspace);
        } catch {
          // best-effort cleanup
        }
        if (workspace.kind === "tensorlake" && workspace.cleanupStatus) {
          runStore.setCleanupStatus(req.runId, workspace.cleanupStatus);
        }
      }
    }
  }

  private async gatherRelevantFiles(
    workspace: Workspace,
    runner: Runner,
  ): Promise<{ path: string; content: string }[]> {
    const results: { path: string; content: string }[] = [];
    const all = await runner.listFiles(workspace);
    const include = new Set<string>(RELEVANT_FILE_GLOBS);
    for (const f of all) {
      if (f.startsWith("src/") && (f.endsWith(".ts") || f.endsWith(".tsx"))) {
        include.add(f);
      }
    }
    for (const rel of include) {
      try {
        const content = await runner.readFile(workspace, rel);
        results.push({ path: rel, content });
      } catch {
        // skip missing files
      }
    }
    return results;
  }
}

export function newRunId(): string {
  return randomUUID();
}
