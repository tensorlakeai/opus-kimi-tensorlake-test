import { describe, expect, it } from "vitest";
import { PatchProposalSchema } from "@ai-fix-runner/shared";
import { FixtureRepairEngine } from "../src/repair/FixtureRepairEngine.js";

const engine = new FixtureRepairEngine();

const FIXTURES: { id: string; targetPath: string }[] = [
  { id: "invoice-calculator-bug", targetPath: "src/calculateInvoice.ts" },
  { id: "markdown-parser-bug", targetPath: "src/parser.ts" },
  { id: "todo-api-bug", targetPath: "src/app.ts" },
];

describe("FixtureRepairEngine", () => {
  for (const f of FIXTURES) {
    it(`returns a valid patch for ${f.id} targeting ${f.targetPath}`, async () => {
      const proposal = await engine.proposePatch({
        fixtureId: f.id,
        attemptNumber: 1,
        failingCommand: {
          command: "npm",
          args: ["test"],
          cwd: "/tmp/x",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 100,
          exitCode: 1,
          signal: null,
          stdout: "fail",
          stderr: "",
          timedOut: false,
          truncated: false,
          success: false,
        },
        relevantFiles: [],
      });
      expect(proposal.kind).toBe("patch");
      if (proposal.kind !== "patch") return; // type narrow
      // validates against the canonical zod schema
      const validated = PatchProposalSchema.parse(proposal);
      expect(validated.edits.map((e) => e.path)).toContain(f.targetPath);
      expect(validated.edits[0].content.length).toBeGreaterThan(50);
    });
  }

  it("returns no_patch for unknown fixtures", async () => {
    const p = await engine.proposePatch({
      fixtureId: "unknown",
      attemptNumber: 1,
      failingCommand: {
        command: "npm",
        args: ["test"],
        cwd: "/tmp/x",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        exitCode: 1,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        truncated: false,
        success: false,
      },
      relevantFiles: [],
    });
    expect(p.kind).toBe("no_patch");
  });

  it("returns no_patch when fixtureId is null", async () => {
    const p = await engine.proposePatch({
      fixtureId: null,
      attemptNumber: 1,
      failingCommand: {
        command: "npm",
        args: ["test"],
        cwd: "/tmp/x",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        exitCode: 1,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        truncated: false,
        success: false,
      },
      relevantFiles: [],
    });
    expect(p.kind).toBe("no_patch");
  });
});
