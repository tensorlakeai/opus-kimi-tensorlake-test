import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { RunView } from "@ai-fix-runner/shared";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { migrate } from "../src/db/migrate.js";
import { openDatabase } from "../src/db/sqlite.js";
import { RunStore } from "../src/db/RunStore.js";
import { RepairLoop } from "../src/orchestrator/RepairLoop.js";
import { createSerialQueue } from "../src/orchestrator/runQueue.js";
import { PatchApplier } from "../src/patches/PatchApplier.js";
import { FixtureRepairEngine } from "../src/repair/FixtureRepairEngine.js";
import { createRunnerFactory } from "../src/runner/RunnerFactory.js";

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

  const cfg: AppConfig = {
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
    defaultRunner: "local",
    tensorlake: {
      configured: false,
      timeoutSeconds: 900,
      keepSandboxes: false,
      remoteRoot: "/tmp/repo",
      useNamedSandboxes: false,
      sandboxNamePrefix: "ai-fix-runner",
    },
  };
  const db = openDatabase(cfg.databaseUrl);
  migrate(db);
  const runStore = new RunStore(db);
  const runnerFactory = createRunnerFactory(cfg);
  const patchApplier = new PatchApplier();
  const engine = new FixtureRepairEngine();
  const queue = createSerialQueue();
  const repairLoop = new RepairLoop({
    repairEngine: engine,
    patchApplier,
    runStore,
    timeouts: {
      installMs: cfg.installTimeoutMs,
      testMs: cfg.testTimeoutMs,
      buildMs: cfg.buildTimeoutMs,
    },
  });
  server = createApp({ cfg, runStore, repairLoop, queue, runnerFactory });
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

  it("GET /api/config exposes runner config and never leaks the API key", async () => {
    const r = await request(server).get("/api/config");
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("allowCustomRepoPaths");
    expect(r.body).toHaveProperty("keepWorkspaces");
    expect(r.body).toHaveProperty("defaultRunner", "local");
    expect(r.body.availableRunners).toEqual(["local"]);
    expect(r.body.tensorlake.configured).toBe(false);
    expect(r.body.tensorlake.reason).toMatch(/TENSORLAKE_API_KEY/);
    // Should never serialize a tensorlake apiKey field.
    expect(JSON.stringify(r.body)).not.toMatch(/apiKey/i);
  });

  it("rejects POST /api/runs with runner=tensorlake when not configured", async () => {
    const r = await request(server)
      .post("/api/runs")
      .send({
        source: { type: "fixture", fixtureId: "invoice-calculator-bug" },
        maxAttempts: 1,
        commands: {
          install: ["npm", "install"],
          test: ["npm", "test"],
          build: ["npm", "run", "build"],
        },
        runBuildAfterTestsPass: false,
        runner: "tensorlake",
      });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Tensorlake.*not configured/);
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
      expect(final.runner).toBe("local");
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
