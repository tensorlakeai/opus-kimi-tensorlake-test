#!/usr/bin/env node
// Live end-to-end test for the Tensorlake runner.
//
// Skips silently when TENSORLAKE_API_KEY is unset (so CI doesn't fail without
// credentials). When set, talks to a running dev API (npm run dev) and drives
// all three built-in fixtures through `runner: "tensorlake"`. Asserts each
// fixture passes with the expected changedFiles.
//
// Usage:
//   export TENSORLAKE_API_KEY=tl_apiKey_...
//   npm run dev                         # in another terminal
//   npm run test:tensorlake:live

const BASE = process.env.AI_FIX_RUNNER_URL ?? "http://localhost:8787";

if (!process.env.TENSORLAKE_API_KEY) {
  console.log(
    "[skip] TENSORLAKE_API_KEY is not set — skipping live Tensorlake test",
  );
  process.exit(0);
}

const FIXTURES = [
  { id: "invoice-calculator-bug", expectedFile: "src/calculateInvoice.ts" },
  { id: "markdown-parser-bug", expectedFile: "src/parser.ts" },
  { id: "todo-api-bug", expectedFile: "src/app.ts" },
];

const cmds = {
  install: ["npm", "install"],
  test: ["npm", "test"],
  build: ["npm", "run", "build"],
};

async function preflight() {
  const r = await fetch(`${BASE}/api/config`);
  if (!r.ok) {
    throw new Error(
      `GET /api/config failed: ${r.status}. Is the API running at ${BASE}?`,
    );
  }
  const cfg = await r.json();
  if (!cfg.tensorlake?.configured) {
    throw new Error(
      `The API reports tensorlake.configured=false. Set TENSORLAKE_API_KEY in the backend env and restart the dev server.`,
    );
  }
  console.log(`Tensorlake configured. Default runner: ${cfg.defaultRunner}`);
}

async function startRun(fixtureId) {
  const r = await fetch(`${BASE}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { type: "fixture", fixtureId },
      maxAttempts: 3,
      commands: cmds,
      runBuildAfterTestsPass: true,
      runner: "tensorlake",
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`startRun ${fixtureId} failed: ${r.status} ${body}`);
  }
  const body = await r.json();
  return body.runId;
}

async function poll(runId, timeoutMs = 900_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}/api/runs/${runId}`);
    const view = await r.json();
    if (["passed", "failed", "error"].includes(view.status)) return view;
    await new Promise((res) => setTimeout(res, 2_000));
  }
  throw new Error(`run ${runId} did not finish within ${timeoutMs}ms`);
}

await preflight();
let allOk = true;
console.log(`Targeting ${BASE} (runner=tensorlake)`);
for (const f of FIXTURES) {
  process.stdout.write(`- ${f.id} … `);
  try {
    const id = await startRun(f.id);
    const view = await poll(id);
    const phases = view.attempts.map((a) => a.phase);
    const ok =
      view.status === "passed" &&
      view.runner === "tensorlake" &&
      view.tensorlake?.sandboxId &&
      phases.includes("initial_test") &&
      phases.includes("after_patch") &&
      phases.includes("build") &&
      view.changedFiles.includes(f.expectedFile);
    if (ok) {
      console.log(
        `PASS (${id.slice(0, 8)}, sandbox=${view.tensorlake.sandboxId})`,
      );
    } else {
      allOk = false;
      console.log(
        `FAIL — status=${view.status}, runner=${view.runner}, sandbox=${view.tensorlake?.sandboxId ?? "—"}, phases=${phases.join(",")}, changed=${view.changedFiles.join(",")}`,
      );
      if (view.errorMessage) console.log(`     ${view.errorMessage}`);
    }
  } catch (e) {
    allOk = false;
    console.log(`ERROR — ${e.message}`);
  }
}
process.exit(allOk ? 0 : 1);
