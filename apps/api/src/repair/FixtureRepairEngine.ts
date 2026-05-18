import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { RepairProposal } from "@ai-fix-runner/shared";
import type { RepairEngine, RepairInput } from "./types.js";

interface FixtureFix {
  targetPath: string;
  dataFile: string;
  summary: string;
}

const FIXES: Record<string, FixtureFix> = {
  "invoice-calculator-bug": {
    targetPath: "src/calculateInvoice.ts",
    dataFile: "invoice-calculator-bug__calculateInvoice.txt",
    summary:
      "Fix invoice calculation: validate inputs, apply discount before tax, and round only the final total.",
  },
  "markdown-parser-bug": {
    targetPath: "src/parser.ts",
    dataFile: "markdown-parser-bug__parser.txt",
    summary:
      "Fix markdown parser: only treat lines starting with '- ' as list items, and use a strict fenced-code state machine.",
  },
  "todo-api-bug": {
    targetPath: "src/app.ts",
    dataFile: "todo-api-bug__app.txt",
    summary:
      "Fix todo API: validate empty title and non-boolean completed, and return the updated todo after PATCH.",
  },
};

const dataDir = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "fixtures",
  "data",
);

/**
 * Deterministic engine for the built-in fixtures. Given a known fixtureId, it
 * returns a replace_file patch with the canonical correct content for that
 * fixture's bug. Test 2 will swap this for an LLM-backed engine.
 */
export class FixtureRepairEngine implements RepairEngine {
  readonly name = "FixtureRepairEngine";

  async proposePatch(input: RepairInput): Promise<RepairProposal> {
    if (!input.fixtureId) {
      return {
        kind: "no_patch",
        message: "FixtureRepairEngine only handles built-in fixtures.",
      };
    }
    const fix = FIXES[input.fixtureId];
    if (!fix) {
      return {
        kind: "no_patch",
        message: `No canonical fix registered for fixture '${input.fixtureId}'.`,
      };
    }
    const content = readDataFile(fix.dataFile);
    return {
      kind: "patch",
      summary: fix.summary,
      edits: [{ path: fix.targetPath, mode: "replace_file", content }],
    };
  }
}

function readDataFile(name: string): string {
  // The .txt files are copied to dist/ during build (see apps/api/package.json
  // build script). At dev time tsx serves them from src/.
  const full = path.join(dataDir, name);
  return fs.readFileSync(full, "utf8");
}
