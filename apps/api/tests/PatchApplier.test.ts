import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PatchApplier } from "../src/patches/PatchApplier.js";
import { LocalRunner } from "../src/runner/LocalRunner.js";

let workspaceRoot: string;
let fixturesRoot: string;
let applier: PatchApplier;
let runner: LocalRunner;

beforeEach(async () => {
  const base = await fs.mkdtemp(
    path.join(os.tmpdir(), "aifix-patchapplier-"),
  );
  workspaceRoot = path.join(base, "workspaces");
  fixturesRoot = path.join(base, "fixtures");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(path.join(fixturesRoot, "demo"), { recursive: true });
  await fs.writeFile(path.join(fixturesRoot, "demo", "marker"), "hi");
  runner = new LocalRunner({
    workspaceRoot,
    fixturesRoot,
    uploadRoot: path.join(base, "uploads"),
    maxStdioBytes: 4096,
    allowCustomRepoPaths: false,
    keepWorkspaces: false,
    commandAllowlist: new Set(["node"]),
  });
  applier = new PatchApplier();
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("PatchApplier", () => {
  it("writes a replace_file edit and reports changed files", async () => {
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "p-1",
    );
    const result = await applier.applyPatch(runner, ws, {
      kind: "patch",
      summary: "Add greeting",
      edits: [
        { path: "src/index.ts", mode: "replace_file", content: "export const x = 1;\n" },
      ],
    });
    expect(result.summary).toBe("Add greeting");
    expect(result.changedFiles).toEqual(["src/index.ts"]);
    const written = await runner.readFile(ws, "src/index.ts");
    expect(written).toBe("export const x = 1;\n");
  });

  it("rejects path traversal in the edit", async () => {
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "p-2",
    );
    await expect(
      applier.applyPatch(runner, ws, {
        kind: "patch",
        summary: "evil",
        edits: [
          { path: "../escape.txt", mode: "replace_file", content: "x" },
        ],
      }),
    ).rejects.toThrow();
  });

  it("rejects absolute paths in the edit", async () => {
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "p-3",
    );
    await expect(
      applier.applyPatch(runner, ws, {
        kind: "patch",
        summary: "evil",
        edits: [{ path: "/etc/passwd", mode: "replace_file", content: "x" }],
      }),
    ).rejects.toThrow();
  });

  it("requires a non-empty summary and at least one edit", async () => {
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "p-4",
    );
    await expect(
      applier.applyPatch(runner, ws, {
        kind: "patch",
        summary: "",
        edits: [
          { path: "a.txt", mode: "replace_file", content: "x" },
        ],
      }),
    ).rejects.toThrow();
    await expect(
      applier.applyPatch(runner, ws, {
        kind: "patch",
        summary: "ok",
        edits: [],
      }),
    ).rejects.toThrow();
  });
});
