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
 * This keeps PatchApplier reusable when LocalRunner is swapped for
 * TensorlakeRunner.
 */
export class PatchApplier {
  constructor(private readonly runner: Runner) {}

  async applyPatch(
    workspace: Workspace,
    patch: unknown,
  ): Promise<AppliedPatchResult> {
    const parsed = PatchProposalSchema.parse(patch);
    return await this.applyValidated(workspace, parsed);
  }

  async applyValidated(
    workspace: Workspace,
    patch: PatchProposal,
  ): Promise<AppliedPatchResult> {
    const changed: string[] = [];
    for (const edit of patch.edits) {
      // Schema already rejects '..' and absolute paths, but Runner.writeFile
      // also enforces this defensively.
      await this.runner.writeFile(workspace, edit.path, edit.content);
      changed.push(edit.path);
    }
    return { summary: patch.summary, changedFiles: changed };
  }
}
