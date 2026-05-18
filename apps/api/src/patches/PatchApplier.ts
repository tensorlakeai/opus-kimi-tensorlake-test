import type { PatchProposal } from "@ai-fix-runner/shared";
import type { Runner, Workspace } from "../runner/types.js";
import { PatchProposalSchema } from "./schema.js";

export interface AppliedPatchResult {
  summary: string;
  changedFiles: string[];
}

/**
 * Applies a structured patch (replace_file edits only) through the Runner
 * abstraction. The Runner is responsible for the actual filesystem write —
 * PatchApplier validates the patch and the paths, and delegates file I/O.
 * The Runner is passed per call (rather than stored on the applier) so the
 * same applier serves both LocalRunner and TensorlakeRunner runs.
 */
export class PatchApplier {
  async applyPatch(
    runner: Runner,
    workspace: Workspace,
    patch: unknown,
  ): Promise<AppliedPatchResult> {
    const parsed = PatchProposalSchema.parse(patch);
    return await this.applyValidated(runner, workspace, parsed);
  }

  async applyValidated(
    runner: Runner,
    workspace: Workspace,
    patch: PatchProposal,
  ): Promise<AppliedPatchResult> {
    const changed: string[] = [];
    for (const edit of patch.edits) {
      // Schema already rejects '..' and absolute paths, but Runner.writeFile
      // also enforces this defensively.
      await runner.writeFile(workspace, edit.path, edit.content);
      changed.push(edit.path);
    }
    return { summary: patch.summary, changedFiles: changed };
  }
}
