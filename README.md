# AI Fix Runner

A tiny local "AI coding-agent evaluator": pick a broken repo, run its tests in an isolated temp workspace, ask a repair function for a patch, apply it, rerun tests, and surface the full attempt history.

This is **Test 1 of a coding-agent benchmark**. It is intentionally **local-only** — no Docker, no remote sandboxes, no paid APIs. The architecture is designed so the local runner can be swapped for a Tensorlake Sandbox runner in Test 2 without touching the orchestration, repair, or patch logic.

## What it does

1. You pick a built-in fixture (or upload a zip / point at a local repo).
2. The backend copies the repo into a fresh temp workspace.
3. It runs `npm install`, then `npm test`.
4. If tests fail, it asks the **repair engine** for a patch.
5. It applies the patch to the workspace and reruns tests.
6. On success it runs `npm run build`.
7. The frontend shows every command, its stdout/stderr, exit code, duration, the patch summary, and the final result.

For the three built-in fixtures, the repair engine has canned canonical patches. For user-provided repos in Test 1, the engine returns a `no_patch` message explaining that no real LLM is wired in yet.

## Why local mode exists

Test 1 is about getting the orchestration, runner abstraction, patch application, and UI right. Putting Tensorlake into the loop on day one would couple the wrong layers — the goal is that **the repair loop doesn't know or care where commands run**. Once that boundary is right, Test 2 implements `TensorlakeRunner` against the existing `Runner` interface and the only line that changes is the binding in `apps/api/src/index.ts`.

## Stack

- TypeScript everywhere
- Node 18.17+ backend (Express, better-sqlite3, Zod, multer, yauzl)
- React + Vite frontend
- Vitest for tests
- SQLite for run history
- `child_process.spawn` (never `exec`, never `shell: true`) for local command execution
- npm workspaces

## Setup

```bash
cp .env.example .env       # optional — defaults are sensible
npm install                # installs api + web + shared
npm test                   # runs unit + 1 integration test (needs npm cache for the fixture install)
npm run build              # builds shared → api → web
npm run dev                # starts API on :8787 and web on :5173
```

Open <http://localhost:5173>.

> The repo root's `npm install` does **not** install fixture dependencies. The `LocalRunner` does that, in a fresh temp copy of the fixture, only when you actually start a run. This keeps each fixture genuinely standalone.

## Verifying it manually with curl

```bash
curl http://localhost:8787/health
curl http://localhost:8787/api/fixtures

curl -X POST http://localhost:8787/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "source": { "type": "fixture", "fixtureId": "invoice-calculator-bug" },
    "maxAttempts": 3,
    "commands": {
      "install": ["npm", "install"],
      "test":    ["npm", "test"],
      "build":   ["npm", "run", "build"]
    },
    "runBuildAfterTestsPass": true
  }'
# → { "runId": "..." }

curl http://localhost:8787/api/runs/<runId>      # poll until status is terminal
```

Expected for `invoice-calculator-bug`:

- `install` attempt passes
- `initial_test` attempt fails (multiple Vitest assertions fail)
- A `patch` is attached to that attempt with `changedFiles = ["src/calculateInvoice.ts"]`
- An `after_patch` attempt passes
- A `build` attempt passes
- Final `status` is `passed`

Run the same sanity check across all three fixtures:

```bash
npm run fixtures:test     # talks to the dev API at :8787
```

## Built-in fixtures

| Fixture | Bug | Fixed file |
|---|---|---|
| `invoice-calculator-bug` | Rounds line items too early, applies tax before discount, no input validation | `src/calculateInvoice.ts` |
| `markdown-parser-bug` | Treats any hyphen as a list marker, fenced-code state machine drops the closing fence into a paragraph | `src/parser.ts` |
| `todo-api-bug` | `POST /todos` accepts empty titles; `PATCH /todos/:id` doesn't validate `completed` and returns the pre-mutation snapshot | `src/app.ts` |

Each fixture is a real, standalone TS project (`package.json`, `tsconfig.json`, `vitest.config.ts`, `src/`, `README.md`). It is **excluded** from the root npm workspaces on purpose, so `npm install` doesn't hoist its dependencies and the LocalRunner is exercising a realistic install in the temp workspace.

## Custom repo support

Two modes:

- **Upload a zip.** The frontend sends a `.zip` to `POST /api/uploads`. The server extracts it safely (refuses entries with `..` or absolute paths, caps total bytes and entry count) into `UPLOAD_ROOT/<uploadId>/`. You then start a run from `POST /api/runs/from-upload`.
- **Local path.** Disabled by default. Set `ALLOW_CUSTOM_REPO_PATHS=true` in `.env` and restart the API. The frontend will enable the local-path input. The server still validates the path exists; it does not attempt any other sandboxing.

For custom repos, **automatic patching is not available in Test 1.** Install / test / build still run and their logs are shown, but if tests fail the run ends with a `no_patch` message. Wiring a real LLM-backed `RepairEngine` is left for Test 2 (or a follow-up of Test 1).

## Local execution safety

This is a local demo, **not a sandbox.** Be deliberate about what you point it at:

- ✅ Commands are passed as `(command, args[])`, never as a shell string. `shell: false`, `spawn` only.
- ✅ The first token of each command must be in an allowlist (default: `npm`, `npx`, `node`, `pnpm`, `yarn`).
- ✅ Commands run inside the **copied** workspace; the original fixture/local path is never mutated.
- ✅ Path-traversal guards on patch application, zip extraction, and workspace copy.
- ✅ Per-command timeouts (`install` 120 s, `test` 60 s, `build` 60 s) — kills the process and marks `timedOut: true`.
- ✅ stdout/stderr are capped at `MAX_STDIO_BYTES` (default 200 KB) and marked `truncated: true`.
- ✅ `node_modules` and `.git` are skipped when copying user repos.
- ❌ The repo's package scripts can still run arbitrary code on your machine during `npm install` and `npm test`. Use trusted repos only.

## Environment

`.env` is parsed by `apps/api/src/config.ts`:

```
PORT=8787
DATABASE_URL=./data/ai-fix-runner.sqlite
WORKSPACE_ROOT=./tmp/workspaces
UPLOAD_ROOT=./tmp/uploads
KEEP_WORKSPACES=false      # set to true to keep temp workspaces for debugging
ALLOW_CUSTOM_REPO_PATHS=false
MAX_STDIO_BYTES=200000
```

## Architecture / where the Tensorlake swap will land

```
apps/api/src/
  runner/types.ts            ← Runner interface (the seam)
  runner/LocalRunner.ts      ← only Test 1 implementation; Test 2 adds TensorlakeRunner here
  orchestrator/RepairLoop.ts ← depends ONLY on Runner / RepairEngine / PatchApplier interfaces
  repair/types.ts            ← RepairEngine interface
  repair/FixtureRepairEngine.ts
  repair/NoopRepairEngine.ts
  patches/PatchApplier.ts
  patches/schema.ts          ← zod-validated patch shape
  db/RunStore.ts             ← SQLite persistence
  routes/                    ← health, fixtures, runs, uploads, config
  index.ts                   ← the only file that binds LocalRunner — swap it for TensorlakeRunner in Test 2
```

The repair loop is intentionally runner-agnostic. Test 2's responsibilities are:
1. Add `apps/api/src/runner/TensorlakeRunner.ts` implementing the same interface against the Sandbox API.
2. Change the binding in `index.ts`.

No other code should need to change.

## Troubleshooting

- **`npm test` times out** — the integration test runs a real `npm install` in a temp workspace. The first run can be slow if the npm cache is cold. Bump the test timeout in `apps/api/vitest.config.ts` or run with a warm cache.
- **Fixture install fails behind a corporate proxy** — set `npm_config_proxy` / `npm_config_https_proxy` in your shell before starting the dev server.
- **"command not in allowlist"** — the default allowlist is `npm npx node pnpm yarn`. Extend it in `apps/api/src/config.ts` if you need another tool.
- **Workspace clutter** — temp workspaces are cleaned up automatically. Set `KEEP_WORKSPACES=true` to keep them for inspection (e.g. to verify the patch was actually written).

## Intentionally-not-done

- Diff-based patches (we only support `replace_file` edits — keeps validation easy).
- SSE / WebSocket log streaming (the UI polls `GET /api/runs/:id` at 1 s; this is the spec's "near-live").
- LLM-backed repair engine for user repos. The `NoopRepairEngine` returns an explanatory message so the UI can surface the limitation honestly.
- Frontend unit tests.
- Auth / multi-user / persistence beyond the local SQLite file.

## Test 1 success criteria (self-check)

- [x] `npm install` works at the repo root
- [x] `npm test` passes (unit tests + 1 integration test that drives the invoice fixture end-to-end)
- [x] `npm run build` produces working `apps/api/dist` and `apps/web/dist`
- [x] `npm run dev` boots API on 8787 and Vite on 5173
- [x] `GET /api/fixtures` lists all three fixtures
- [x] `invoice-calculator-bug`, `markdown-parser-bug`, `todo-api-bug` each: initial test fails → patch applied → tests pass → build passes
- [x] Run history is persisted in SQLite and reachable via `GET /api/runs` and the History page
- [x] The UI shows attempts, logs, patches, changed files, exit codes, and a final status badge
- [x] `Runner`, `RepairEngine`, `PatchApplier` are clearly separated; swapping `LocalRunner` for `TensorlakeRunner` is a single-file change in Test 2
