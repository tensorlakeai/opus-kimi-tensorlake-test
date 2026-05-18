// Re-export the canonical schemas so PatchApplier and friends can import from a
// stable local path. The schemas themselves live in @ai-fix-runner/shared.
export {
  PatchEditSchema,
  PatchProposalSchema,
  NoPatchProposalSchema,
  RepairProposalSchema,
} from "@ai-fix-runner/shared";
