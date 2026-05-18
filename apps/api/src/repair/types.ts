import type { CommandResult, RepairProposal } from "@ai-fix-runner/shared";

export interface RepairInput {
  fixtureId: string | null;
  attemptNumber: number;
  failingCommand: CommandResult;
  relevantFiles: { path: string; content: string }[];
}

export interface RepairEngine {
  name: string;
  proposePatch(input: RepairInput): Promise<RepairProposal>;
}
