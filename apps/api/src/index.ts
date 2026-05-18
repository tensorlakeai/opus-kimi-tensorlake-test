import fs from "node:fs/promises";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { migrate } from "./db/migrate.js";
import { openDatabase } from "./db/sqlite.js";
import { RunStore } from "./db/RunStore.js";
import { RepairLoop } from "./orchestrator/RepairLoop.js";
import { createSerialQueue } from "./orchestrator/runQueue.js";
import { PatchApplier } from "./patches/PatchApplier.js";
import { FixtureRepairEngine } from "./repair/FixtureRepairEngine.js";
import { NoopRepairEngine } from "./repair/NoopRepairEngine.js";
import { LocalRunner } from "./runner/LocalRunner.js";
import type { RepairEngine, RepairInput } from "./repair/types.js";

async function main() {
  const cfg = loadConfig();
  await fs.mkdir(cfg.workspaceRoot, { recursive: true });
  await fs.mkdir(cfg.uploadRoot, { recursive: true });

  const db = openDatabase(cfg.databaseUrl);
  migrate(db);
  const runStore = new RunStore(db);

  // ---- Runner binding ----
  // In Test 1 this is the LocalRunner. In Test 2 this will be a
  // TensorlakeRunner — same interface, swap one constructor.
  const runner = new LocalRunner({
    workspaceRoot: cfg.workspaceRoot,
    fixturesRoot: cfg.fixturesRoot,
    uploadRoot: cfg.uploadRoot,
    maxStdioBytes: cfg.maxStdioBytes,
    allowCustomRepoPaths: cfg.allowCustomRepoPaths,
    keepWorkspaces: cfg.keepWorkspaces,
    commandAllowlist: cfg.commandAllowlist,
  });

  // ---- Repair engine binding ----
  // Built-in fixtures get deterministic patches; everything else gets a no-op
  // with an explanatory message until a real LLM engine is wired in.
  const fixtureEngine = new FixtureRepairEngine();
  const noopEngine = new NoopRepairEngine();
  const compositeEngine: RepairEngine = {
    name: "CompositeRepairEngine",
    async proposePatch(input: RepairInput) {
      if (input.fixtureId) return fixtureEngine.proposePatch(input);
      return noopEngine.proposePatch(input);
    },
  };

  const patchApplier = new PatchApplier(runner);
  const queue = createSerialQueue();
  const repairLoop = new RepairLoop({
    runner,
    repairEngine: compositeEngine,
    patchApplier,
    runStore,
    timeouts: {
      installMs: cfg.installTimeoutMs,
      testMs: cfg.testTimeoutMs,
      buildMs: cfg.buildTimeoutMs,
    },
  });

  const app = createApp({ cfg, runStore, repairLoop, queue });
  app.listen(cfg.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on http://localhost:${cfg.port}`);
    // eslint-disable-next-line no-console
    console.log(`[api] workspace root: ${cfg.workspaceRoot}`);
    // eslint-disable-next-line no-console
    console.log(`[api] fixtures root:  ${cfg.fixturesRoot}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[api] fatal:", err);
  process.exit(1);
});
