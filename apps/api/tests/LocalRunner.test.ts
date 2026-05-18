import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalRunner } from "../src/runner/LocalRunner.js";

let workspaceRoot: string;
let fixturesRoot: string;
let uploadRoot: string;
let runner: LocalRunner;

beforeEach(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "aifix-localrunner-"));
  workspaceRoot = path.join(base, "workspaces");
  fixturesRoot = path.join(base, "fixtures");
  uploadRoot = path.join(base, "uploads");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(path.join(fixturesRoot, "demo"), { recursive: true });
  await fs.writeFile(
    path.join(fixturesRoot, "demo", "hello.txt"),
    "hello world",
  );
  await fs.mkdir(uploadRoot, { recursive: true });

  runner = new LocalRunner({
    workspaceRoot,
    fixturesRoot,
    uploadRoot,
    maxStdioBytes: 4096,
    allowCustomRepoPaths: false,
    keepWorkspaces: false,
    commandAllowlist: new Set(["node", "npm"]),
  });
});

afterEach(async () => {
  // best-effort cleanup
  try {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("LocalRunner", () => {
  it("prepares a fixture workspace by copying files", async () => {
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-1",
    );
    const content = await runner.readFile(ws, "hello.txt");
    expect(content).toBe("hello world");
  });

  it("runs a command and captures stdout + exit code", async () => {
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-2",
    );
    const r = await runner.runCommand(
      ws,
      "node",
      ["-e", "process.stdout.write('hi'); process.exit(0)"],
      { timeoutMs: 5000 },
    );
    expect(r.success).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("hi");
    expect(r.timedOut).toBe(false);
  });

  it("captures non-zero exit code and stderr", async () => {
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-3",
    );
    const r = await runner.runCommand(
      ws,
      "node",
      ["-e", "process.stderr.write('nope'); process.exit(7)"],
      { timeoutMs: 5000 },
    );
    expect(r.success).toBe(false);
    expect(r.exitCode).toBe(7);
    expect(r.stderr).toBe("nope");
  });

  it("kills and marks timed-out long-running commands", async () => {
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-4",
    );
    const r = await runner.runCommand(
      ws,
      "node",
      ["-e", "setInterval(()=>{}, 1000)"],
      { timeoutMs: 200 },
    );
    expect(r.timedOut).toBe(true);
    expect(r.success).toBe(false);
  });

  it("rejects commands not in the allowlist", async () => {
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-5",
    );
    await expect(
      runner.runCommand(ws, "ls", [], { timeoutMs: 1000 }),
    ).rejects.toThrow(/allowlist/);
  });

  it("refuses path traversal on writeFile", async () => {
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-6",
    );
    await expect(
      runner.writeFile(ws, "../escape.txt", "evil"),
    ).rejects.toThrow();
  });
});
