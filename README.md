# AI Fix Runner

A tiny "AI coding-agent evaluator": pick a broken repo, run its tests in an isolated workspace, ask a repair function for a patch, apply it, rerun tests, and surface the full attempt history.

Two runner backends, selected per request:

- **Local** (Test 1): commands run on your host via `child_process.spawn`. Not a sandbox.
- **Tensorlake** (Test 2): commands run inside a real [Tensorlake Sandbox](https://docs.tensorlake.ai/sandboxes/introduction). Isolated MicroVM, same repair loop, same UI.

The orchestrator, repair engines, patch applier, routes, DB layer, and frontend are runner-agnostic — `apps/api/src/runner/RunnerFactory.ts` is the one place that decides which runner gets used.

## What it does

1. You pick a built-in fixture (or upload a zip / point at a local repo).
2. The backend copies the repo into a fresh temp workspace.
3. It runs `npm install`, then `pnpm test`.
4. If tests fail, it asks the **repair engine** for a patch.
5. It applies the patch to the workspace and reruns tests.
6. On success it runs `pnpm run build`.
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
pnpm test                   # runs unit + 1 integration test (needs npm cache for the fixture install)
pnpm run build              # builds shared → api → web
pnpm run dev                # starts API on :8787 and web on :5173
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
pnpm run fixtures:test     # talks to the dev API at :8787
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

For custom repos, **automatic patching is not available yet.** Install / test / build still run (in either runner) and their logs are shown, but if tests fail the run ends with a `no_patch` message. Wiring a real LLM-backed `RepairEngine` is a separate piece of work. Tensorlake mode is the safer way to run arbitrary uploaded repos because the commands execute inside the sandbox, not on your host.

## Local execution safety

This is a local demo, **not a sandbox.** Be deliberate about what you point it at:

- ✅ Commands are passed as `(command, args[])`, never as a shell string. `shell: false`, `spawn` only.
- ✅ The first token of each command must be in an allowlist (default: `npm`, `pnpm exec`, `node`, `pnpm`, `yarn`).
- ✅ Commands run inside the **copied** workspace; the original fixture/local path is never mutated.
- ✅ Path-traversal guards on patch application, zip extraction, and workspace copy.
- ✅ Per-command timeouts (`install` 120 s, `test` 60 s, `build` 60 s) — kills the process and marks `timedOut: true`.
- ✅ stdout/stderr are capped at `MAX_STDIO_BYTES` (default 200 KB) and marked `truncated: true`.
- ✅ `node_modules` and `.git` are skipped when copying user repos.
- ❌ The repo's package scripts can still run arbitrary code on your machine during `npm install` and `pnpm test`. Use trusted repos only.

## Environment

`.env` is parsed by `apps/api/src/config.ts`. The most relevant keys (see `.env.example` for the full list):

```
PORT=8787
DATABASE_URL=./data/ai-fix-runner.sqlite
WORKSPACE_ROOT=./tmp/workspaces
UPLOAD_ROOT=./tmp/uploads
KEEP_WORKSPACES=false              # keep local temp workspaces for debugging
ALLOW_CUSTOM_REPO_PATHS=false
MAX_STDIO_BYTES=200000

RUNNER_DEFAULT=local               # default runner when the request omits `runner`

TENSORLAKE_API_KEY=                # required to enable the tensorlake runner
TENSORLAKE_DEFAULT_IMAGE=          # leave blank to use Tensorlake's managed default
TENSORLAKE_CPUS=                   # blank → SDK default
TENSORLAKE_MEMORY_MB=
TENSORLAKE_DISK_MB=
TENSORLAKE_TIMEOUT_SECONDS=900     # sandbox-level idle/wall-clock timeout
TENSORLAKE_KEEP_SANDBOXES=false    # leave sandboxes alive after the run for debugging
TENSORLAKE_REMOTE_ROOT=/workspace/repo
```

## Tensorlake mode (Test 2)

Test 2 adds a second runner backend. Same repair loop, same UI, same patch logic — execution moves into a real Tensorlake Sandbox instead of `child_process.spawn` on your laptop.

### Setup

1. Get a key from <https://docs.tensorlake.ai/platform/authentication> (format: `tl_apiKey_*`).
2. Put it in `.env` at the repo root:
   ```
   TENSORLAKE_API_KEY=tl_apiKey_...
   ```
3. Restart the API. `GET /api/config` should now report `tensorlake.configured: true`.
4. On the dashboard, each fixture card and the custom-repo panel now show a `Local | Tensorlake` toggle.

### What changes per request

POST `/api/runs` accepts a new optional `runner` field:

```bash
curl -X POST http://localhost:8787/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "runner": "tensorlake",
    "source": { "type": "fixture", "fixtureId": "invoice-calculator-bug" },
    "maxAttempts": 3,
    "commands": {
      "install": ["npm", "install"],
      "test":    ["npm", "test"],
      "build":   ["npm", "run", "build"]
    },
    "runBuildAfterTestsPass": true
  }'
```

The `GET /api/runs/:id` response gains a `runner` field and (for Tensorlake runs) a `tensorlake: { sandboxId, sandboxName, image, remoteRoot, cleanupStatus }` block. Each command result also carries `runner` and `sandboxId` so you can trace which sandbox ran it.

Verify all three fixtures in Tensorlake mode at once:

```bash
pnpm run test:tensorlake:live      # skips silently if TENSORLAKE_API_KEY isn't set
```

### What happens under the hood

For each Tensorlake run, the backend:

1. Creates an ephemeral sandbox (`Sandbox.create()` from `tensorlake`). No image specified → Tensorlake's managed default, which has Node and npm pre-installed.
2. Uploads the selected repo file-by-file into `/workspace/repo` (skipping `node_modules`, `.git`, `.env`, `*.log`). Path-traversal guards apply on both ends.
3. Sanity-checks that `/workspace/repo/package.json` is present.
4. Runs `npm install`, then enters the same repair loop: `pnpm test` → patch (for fixtures) → `pnpm test` → `pnpm run build`. All `sandbox.run(...)` calls use `workingDir: "/workspace/repo"`.
5. Terminates the sandbox in the `finally` block (or leaves it alive if `TENSORLAKE_KEEP_SANDBOXES=true`).

The same Sandbox handle is reused across attempts in one run, so patched files survive between `initial_test` and `after_patch`. SQLite stores `runner`, `tensorlake_sandbox_id`, image, and `tensorlake_cleanup_status` on the run; per command it stores `runner` and `sandbox_id`.

### Debugging a failed sandbox run

Set `TENSORLAKE_KEEP_SANDBOXES=true` and rerun. The detail page will show `cleanup: kept` and the sandbox stays alive — you can `tl sbx list` to find it and inspect it interactively.

### Tensorlake reference

- Sandboxes intro: <https://docs.tensorlake.ai/sandboxes/introduction>
- Authentication: <https://docs.tensorlake.ai/platform/authentication>
- Lifecycle: <https://docs.tensorlake.ai/sandboxes/lifecycle>
- API reference: <https://docs.tensorlake.ai/api-reference/v2/introduction>
- Sandbox templates: <https://docs.tensorlake.ai/sandboxes/templates>

> **Safety note.** Local mode runs `npm install` / `pnpm test` directly on your machine — only use it with trusted repos. Tensorlake mode is the safer choice for arbitrary input: untrusted package scripts run inside an isolated MicroVM, not on your host.

## Architecture

```
apps/api/src/
  runner/types.ts            ← Runner interface + discriminated Workspace
  runner/LocalRunner.ts      ← Test 1 backend (child_process.spawn)
  runner/TensorlakeRunner.ts ← Test 2 backend (tensorlake SDK)
  runner/RunnerFactory.ts    ← picks a runner per request based on the body's `runner` field
  orchestrator/RepairLoop.ts ← depends ONLY on Runner / RepairEngine / PatchApplier interfaces
  repair/types.ts            ← RepairEngine interface
  repair/FixtureRepairEngine.ts
  repair/NoopRepairEngine.ts
  patches/PatchApplier.ts    ← stateless; takes the runner as an argument
  patches/schema.ts          ← zod-validated patch shape
  db/RunStore.ts             ← SQLite persistence (incl. runner kind + sandbox metadata)
  routes/                    ← health, fixtures, runs, uploads, config
  util/sourceResolver.ts     ← shared fixture/upload/localPath resolution
  util/repoWalker.ts         ← shared exclude-aware repo walker (used by both runners)
  index.ts                   ← wires RunnerFactory, RepairLoop, RunStore
```

The repair loop, repair engines, patch applier, routes, and frontend all depend only on the `Runner` interface — no code outside `runner/` and `RunnerFactory.ts` knows whether execution is happening locally or inside a sandbox.

## Troubleshooting

- **`pnpm test` times out** — the integration test runs a real `npm install` in a temp workspace. The first run can be slow if the npm cache is cold. Bump the test timeout in `apps/api/vitest.config.ts` or run with a warm cache.
- **Fixture install fails behind a corporate proxy** — set `npm_config_proxy` / `npm_config_https_proxy` in your shell before starting the dev server.
- **"command not in allowlist"** — the default allowlist is `npm pnpm exec node pnpm yarn`. Extend it in `apps/api/src/config.ts` if you need another tool.
- **Workspace clutter** — temp workspaces are cleaned up automatically. Set `KEEP_WORKSPACES=true` to keep them for inspection (e.g. to verify the patch was actually written).

## Intentionally-not-done

- Diff-based patches (we only support `replace_file` edits — keeps validation easy).
- SSE / WebSocket log streaming (the UI polls `GET /api/runs/:id` at 1 s; this is the spec's "near-live").
- LLM-backed repair engine for user repos. The `NoopRepairEngine` returns an explanatory message so the UI can surface the limitation honestly.
- Frontend unit tests.
- Auth / multi-user / persistence beyond the local SQLite file.

## Test 1 success criteria (self-check)

- [x] `npm install` works at the repo root
- [x] `pnpm test` passes (unit tests + 1 integration test that drives the invoice fixture end-to-end)
- [x] `pnpm run build` produces working `apps/api/dist` and `apps/web/dist`
- [x] `pnpm run dev` boots API on 8787 and Vite on 5173
- [x] `GET /api/fixtures` lists all three fixtures
- [x] `invoice-calculator-bug`, `markdown-parser-bug`, `todo-api-bug` each: initial test fails → patch applied → tests pass → build passes
- [x] Run history is persisted in SQLite and reachable via `GET /api/runs` and the History page
- [x] The UI shows attempts, logs, patches, changed files, exit codes, and a final status badge
- [x] `Runner`, `RepairEngine`, `PatchApplier` are clearly separated

## Test 2 success criteria (self-check)

- [x] `npm install` resolves `tensorlake@^0.5.14` cleanly.
- [x] `pnpm test` still passes without any Tensorlake credentials (local runner regression test + new TensorlakeRunner unit tests with a mocked SDK).
- [x] `pnpm run build` produces working dist for shared / api / web.
- [x] `GET /api/config` reports `defaultRunner`, `availableRunners`, and a `tensorlake.configured` block — and never includes the API key in the response.
- [x] `POST /api/runs` accepts `runner: "tensorlake"` and dispatches through `TensorlakeRunner`. Same request body with `runner: "local"` (or no `runner` field) still works.
- [x] When `TENSORLAKE_API_KEY` is missing, `POST /api/runs` with `runner: "tensorlake"` returns a clean 400 and the backend doesn't crash.
- [x] One sandbox is created per run and reused across attempts (so patched files persist between `initial_test` and `after_patch`).
- [x] SQLite stores runner kind, sandbox id, image, remote root, cleanup status, and per-command runner / sandbox id.
- [x] UI exposes a `Local | Tensorlake` selector that's disabled when Tensorlake isn't configured.
- [ ] *(Requires a live API key)* All three fixtures pass through `pnpm run test:tensorlake:live`: install → initial_test fails → patch applied → after_patch passes → build passes — all inside the sandbox.

## Dependency installation

Use Node.js 22+ and pnpm 11.28.5. Run `pnpm install --frozen-lockfile` before the
project build/test commands. The committed policy requires registry releases
to be at least 24 hours old, rejects missing publish dates, rechecks frozen
locks, and disables install lifecycle scripts. Run reviewed build steps
explicitly; do not bypass the delay for a newly published dependency.
