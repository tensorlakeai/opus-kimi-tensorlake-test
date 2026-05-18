#!/usr/bin/env node
// Verifies all three built-in fixtures end-to-end by talking to a running API.
// Usage: start the API first (`npm run dev:api`), then `npm run fixtures:test`.
const BASE = process.env.AI_FIX_RUNNER_URL ?? "http://localhost:8787";

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

async function startRun(fixtureId) {
  const r = await fetch(`${BASE}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { type: "fixture", fixtureId },
      maxAttempts: 3,
      commands: cmds,
      runBuildAfterTestsPass: true,
    }),
  });
  if (!r.ok) throw new Error(`startRun ${fixtureId} failed: ${r.status}`);
  const body = await r.json();
  return body.runId;
}

async function poll(runId, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}/api/runs/${runId}`);
    const view = await r.json();
    if (["passed", "failed", "error"].includes(view.status)) return view;
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error(`run ${runId} did not finish within ${timeoutMs}ms`);
}

let allOk = true;
console.log(`Targeting ${BASE}`);
for (const f of FIXTURES) {
  process.stdout.write(`- ${f.id} … `);
  try {
    const id = await startRun(f.id);
    const view = await poll(id);
    const phases = view.attempts.map((a) => a.phase);
    const ok =
      view.status === "passed" &&
      phases.includes("initial_test") &&
      phases.includes("after_patch") &&
      phases.includes("build") &&
      view.changedFiles.includes(f.expectedFile);
    if (ok) {
      console.log(`PASS (${id.slice(0, 8)})`);
    } else {
      allOk = false;
      console.log(
        `FAIL — status=${view.status}, phases=${phases.join(",")}, changed=${view.changedFiles.join(",")}`,
      );
      if (view.errorMessage) console.log(`     ${view.errorMessage}`);
    }
  } catch (e) {
    allOk = false;
    console.log(`ERROR — ${e.message}`);
  }
}
process.exit(allOk ? 0 : 1);
