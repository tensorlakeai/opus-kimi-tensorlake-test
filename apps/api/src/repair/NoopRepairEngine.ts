import type { RepairProposal } from "@ai-fix-runner/shared";
import type { RepairEngine, RepairInput } from "./types.js";

/**
 * Returned for any source where we don't have a canned fix. The repair loop
 * surfaces this message to the user verbatim. Test 2 will swap this for a real
 * LLM-backed engine.
 */
export class NoopRepairEngine implements RepairEngine {
  readonly name = "NoopRepairEngine";

  async proposePatch(_input: RepairInput): Promise<RepairProposal> {
    return {
      kind: "no_patch",
      message:
        "No real LLM repair engine is configured for custom repos in Test 1. Automatic patching is available for built-in fixtures only.",
    };
  }
}
