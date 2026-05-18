import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { RunView } from "@ai-fix-runner/shared";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { openDatabase } from "../src/db/sqlite.js";
import { RunStore } from "../src/db/RunStore.js";
import { RepairLoop } from "../src/orchestrator/RepairLoop.js";
import { createSerialQueue } from "../src/orchestrator/runQueue.js";
import { PatchApplier } from "../src/patches/PatchApplier.js";
import { FixtureRepairEngine } from "../src/repair/FixtureRepairEngine.js";
import { LocalRunner } from "../src/runner/LocalRunner.js";

let server: ReturnType<typeof createApp>;
let workspaceRoot: string;
let uploadRoot: string;
let dbPath: string;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_ROOT = path.resolve(__dirname, "../../../fixtures");

beforeAll(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "aifix-api-"));
  workspaceRoot = path.join(base, "workspaces");
  uploadRoot = path.join(base, "uploads");
  dbPath = path.join(base, "test.sqlite");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(uploadRoot, { recursive: true });

  const cfg = {
    port: 0,
    databaseUrl: dbPath,
    workspaceRoot,
    uploadRoot,
    fixturesRoot: FIXTURES_ROOT,
    keepWorkspaces: false,
    allowCustomRepoPaths: false,
    maxStdioBytes: 200_000,
    installTimeoutMs: 240_000,
    testTimeoutMs: 60_000,
    buildTimeoutMs: 60_000,
    commandAllowlist: new Set(["npm", "npx", "node"]),
  };
  const db = openDatabase(cfg.databaseUrl);
  migrate(db);
  const runStore = new RunStore(db);
  const runner = new LocalRunner(cfg);
  const patchApplier = new PatchApplier(runner);
  const engine = new FixtureRepairEngine();
  const queue = createSerialQueue();
  const repairLoop = new RepairLoop({
    runner,
    repairEngine: engine,
    patchApplier,
    runStore,
    timeouts: {
      installMs: cfg.installTimeoutMs,
      testMs: cfg.testTimeoutMs,
      buildMs: cfg.buildTimeoutMs,
    },
  });
  server = createApp({ cfg, runStore, repairLoop, queue });
});

afterAll(async () => {
  // best-effort cleanup
  try {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
    await fs.rm(uploadRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("API health + fixtures", () => {
  it("GET /health returns ok", async () => {
    const r = await request(server).get("/health");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it("GET /api/fixtures lists all 3 built-in fixtures", async () => {
    const r = await request(server).get("/api/fixtures");
    expect(r.status).toBe(200);
    const ids = r.body.fixtures.map((f: { id: string }) => f.id).sort();
    expect(ids).toEqual([
      "invoice-calculator-bug",
      "markdown-parser-bug",
      "todo-api-bug",
    ]);
  });

  it("GET /api/config exposes the public flags", async () => {
    const r = await request(server).get("/api/config");
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("allowCustomRepoPaths");
    expect(r.body).toHaveProperty("keepWorkspaces");
  });
});

describe("API end-to-end repair loop", () => {
  it(
    "runs invoice-calculator-bug: initial test fails, patch applied, tests pass, build passes",
    async () => {
      const start = await request(server)
        .post("/api/runs")
        .send({
          source: { type: "fixture", fixtureId: "invoice-calculator-bug" },
          maxAttempts: 3,
          commands: {
            install: ["npm", "install"],
            test: ["npm", "test"],
            build: ["npm", "run", "build"],
          },
          runBuildAfterTestsPass: true,
        });
      expect(start.status).toBe(202);
      const runId: string = start.body.runId;

      const final = await waitForTerminal(runId, 240_000);
      expect(final.status).toBe("passed");
      expect(final.changedFiles).toContain("src/calculateInvoice.ts");

      const phases = final.attempts.map((a) => a.phase);
      expect(phases).toContain("install");
      expect(phases).toContain("initial_test");
      expect(phases).toContain("after_patch");
      expect(phases).toContain("build");

      const install = final.attempts.find((a) => a.phase === "install")!;
      expect(install.status).toBe("passed");
      const initial = final.attempts.find((a) => a.phase === "initial_test")!;
      expect(initial.status).toBe("failed");
      expect(initial.patch).toBeTruthy();
      const afterPatch = final.attempts.find((a) => a.phase === "after_patch")!;
      expect(afterPatch.status).toBe("passed");
      const build = final.attempts.find((a) => a.phase === "build")!;
      expect(build.status).toBe("passed");
    },
    260_000,
  );
});

async function waitForTerminal(runId: string, timeoutMs: number): Promise<RunView> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await request(server).get(`/api/runs/${runId}`);
    expect(r.status).toBe(200);
    const view = r.body as RunView;
    if (view.status === "passed" || view.status === "failed" || view.status === "error") {
      return view;
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`Run did not reach terminal status within ${timeoutMs}ms`);
}
