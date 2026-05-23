You are working on Test 2 of a larger AI coding-agent benchmark.

Test 1 already built a local-only app called AI Fix Runner.

Your task now is to upgrade that app so it can run repos inside Tensorlake Sandboxes instead of running them locally with child_process.

This is the real external integration test.

Do NOT rebuild the whole app from scratch unless the existing structure is unusable.
Do NOT remove the local runner.
Do NOT fake Tensorlake results.
Do NOT mock sandbox execution in the production Tensorlake path.
Do NOT hardcode “passed” results.
Do NOT skip actually running install/test/build commands inside Tensorlake.

The goal is to preserve the same product and repair loop from Test 1, but add a real Tensorlake-powered runner.

High-level goal:

Broken repo → upload/copy repo into Tensorlake sandbox → run install/test/build in sandbox → collect logs → repair function proposes patch → apply patch inside sandbox → rerun tests inside sandbox → show result in UI

This should feel like the natural Test 2 upgrade:

Test 1:
LocalRunner using child_process.spawn

Test 2:
TensorlakeRunner using Tensorlake Sandbox

Reference Tensorlake docs while implementing:

- Tensorlake Sandboxes introduction:
  https://docs.tensorlake.ai/sandboxes/introduction

- Tensorlake authentication:
  https://docs.tensorlake.ai/platform/authentication

- Tensorlake sandbox lifecycle:
  https://docs.tensorlake.ai/sandboxes/lifecycle

- Tensorlake API reference:
  https://docs.tensorlake.ai/api-reference/v2/introduction

- Tensorlake sandbox templates:
  https://docs.tensorlake.ai/sandboxes/templates

Use the official Tensorlake TypeScript SDK where possible.

The Tensorlake docs show TypeScript usage with:

npm install tensorlake

and:

import { Sandbox } from "tensorlake";

The app should read the API key from:

TENSORLAKE_API_KEY

Do not hardcode API keys.
Do not commit API keys.
Do not expose the Tensorlake API key to the frontend.

Important context

The existing Test 1 app should already have these concepts:

- Runner interface
- LocalRunner implementation
- RepairEngine interface
- FixtureRepairEngine
- NoopRepairEngine
- PatchApplier
- built-in broken fixture repos
- SQLite run history
- API routes for fixtures and runs
- React UI showing attempts, logs, patches, changed files, and final status

Your job is to add Tensorlake support while keeping that architecture clean.

The final app should support two execution modes:

1. local
2. tensorlake

The user should be able to choose the execution mode from the UI and API.

For example:

{
  "source": {
    "type": "fixture",
    "fixtureId": "invoice-calculator-bug"
  },
  "runner": "tensorlake",
  "maxAttempts": 3,
  "commands": {
    "install": ["npm", "install"],
    "test": ["npm", "test"],
    "build": ["npm", "run", "build"]
  },
  "runBuildAfterTestsPass": true
}

The same request with "runner": "local" should still work.

Core Tensorlake requirement

Implement a real TensorlakeRunner.

It must:

1. Create a Tensorlake sandbox
2. Copy or upload the selected repo into the sandbox
3. Run commands inside the sandbox
4. Capture stdout
5. Capture stderr
6. Capture exit code
7. Capture duration
8. Apply patch edits inside the sandbox
9. Rerun tests inside the sandbox
10. Clean up or terminate the sandbox according to config
11. Store Tensorlake metadata in the run history

The TensorlakeRunner should implement the same Runner interface used by LocalRunner, or a small extension of it.

Do not make the rest of the app care whether execution is local or Tensorlake.

The repair loop should not be duplicated.
Only the execution backend should change.

Expected architecture

Keep or create this structure:

apps/api/src/runner/
  Runner.ts
  LocalRunner.ts
  TensorlakeRunner.ts
  RunnerFactory.ts
  CommandResult.ts
  Workspace.ts

apps/api/src/repair/
  RepairEngine.ts
  FixtureRepairEngine.ts
  NoopRepairEngine.ts

apps/api/src/patch/
  PatchApplier.ts

apps/api/src/routes/
  runs.ts
  fixtures.ts
  config.ts

apps/api/src/tensorlake/
  client.ts
  sandboxFiles.ts
  sandboxProcesses.ts
  errors.ts

The exact filenames can differ, but the separation must be clear.

Runner interface

Use an interface similar to this:

interface Runner {
  kind: "local" | "tensorlake";

  prepareWorkspace(input: PrepareWorkspaceInput): Promise<Workspace>;

  runCommand(
    workspace: Workspace,
    command: string,
    args: string[],
    options?: RunCommandOptions
  ): Promise<CommandResult>;

  readFile(workspace: Workspace, relativePath: string): Promise<string>;

  writeFile(
    workspace: Workspace,
    relativePath: string,
    content: string
  ): Promise<void>;

  listFiles(workspace: Workspace, options?: ListFilesOptions): Promise<string[]>;

  cleanup(workspace: Workspace): Promise<void>;
}

Workspace should support local and Tensorlake modes.

Example:

type Workspace =
  | {
      kind: "local";
      id: string;
      rootPath: string;
    }
  | {
      kind: "tensorlake";
      id: string;
      sandboxId: string;
      sandboxName?: string;
      remoteRoot: string;
      createdAt: string;
    };

CommandResult shape must remain consistent across local and Tensorlake runners:

{
  "command": "npm",
  "args": ["test"],
  "cwd": "/workspace/repo",
  "startedAt": "...",
  "finishedAt": "...",
  "durationMs": 1234,
  "exitCode": 1,
  "signal": null,
  "stdout": "...",
  "stderr": "...",
  "timedOut": false,
  "success": false,
  "runner": "tensorlake",
  "sandboxId": "..."
}

Tensorlake setup

Add the dependency:

npm install tensorlake

Read credentials from:

TENSORLAKE_API_KEY

Update .env.example:

TENSORLAKE_API_KEY=
RUNNER_DEFAULT=local
TENSORLAKE_DEFAULT_IMAGE=tensorlake/ubuntu-minimal
TENSORLAKE_CPUS=2
TENSORLAKE_MEMORY_MB=2048
TENSORLAKE_DISK_MB=10240
TENSORLAKE_TIMEOUT_SECONDS=900
TENSORLAKE_KEEP_SANDBOXES=false
TENSORLAKE_REMOTE_ROOT=/workspace/repo
TENSORLAKE_USE_NAMED_SANDBOXES=false
TENSORLAKE_SANDBOX_NAME_PREFIX=ai-fix-runner

Behavior when API key is missing:

- Local runner should still work
- Tensorlake runner should fail clearly with a helpful error
- Frontend should show “Tensorlake is not configured”
- Backend should never crash at boot just because TENSORLAKE_API_KEY is missing

Add endpoint:

GET /api/config

Returns:

{
  "defaultRunner": "local",
  "availableRunners": ["local", "tensorlake"],
  "tensorlake": {
    "configured": true,
    "defaultImage": "tensorlake/ubuntu-minimal"
  }
}

If no Tensorlake key exists:

{
  "defaultRunner": "local",
  "availableRunners": ["local"],
  "tensorlake": {
    "configured": false,
    "reason": "TENSORLAKE_API_KEY is not set"
  }
}

Tensorlake sandbox creation

Create a sandbox per run by default.

Use ephemeral sandboxes unless TENSORLAKE_USE_NAMED_SANDBOXES=true.

Default behavior:

- create one sandbox per repair run
- copy repo into /workspace/repo
- run all attempts in the same sandbox
- cleanup sandbox at the end unless TENSORLAKE_KEEP_SANDBOXES=true

This is important:

Do not create a new sandbox for every attempt.
Use the same sandbox across attempts so patched files remain in place.

Suggested lifecycle:

1. Create sandbox
2. Prepare /workspace/repo
3. Upload/copy repo contents into /workspace/repo
4. Run install
5. Run tests
6. Apply patch
7. Rerun tests
8. Run build if tests pass
9. Cleanup sandbox or keep it based on env config

Resource configuration

Support:

- image
- cpus
- memoryMb
- diskMb
- timeoutSeconds

Example config:

{
  "image": "tensorlake/ubuntu-minimal",
  "cpus": 2,
  "memoryMb": 2048,
  "diskMb": 10240,
  "timeoutSeconds": 900
}

If the Tensorlake SDK uses different field names, follow the official docs and SDK types.

Do not guess silently. Inspect SDK types and adapt correctly.

Repo transfer into sandbox

Implement a reliable way to copy fixture or uploaded repo files into the Tensorlake sandbox.

The method can be one of these, depending on what the Tensorlake TypeScript SDK supports:

Preferred approach:
- Use SDK file APIs to write files into the sandbox

Alternative approach:
- Create a tar archive of the repo locally
- Upload or write the archive to the sandbox
- Extract it inside the sandbox using tar

Acceptable fallback:
- Use runtime file APIs from the sandbox proxy if SDK helpers are missing

Important file-copy rules:

- Copy the prepared repo into /workspace/repo
- Exclude node_modules
- Exclude .git
- Exclude temp files
- Exclude .env by default
- Preserve package.json, src, tests, tsconfig, vitest config, README
- Preserve nested directories
- Validate paths to prevent path traversal
- Ensure files are written only under /workspace/repo

Before running install, verify the sandbox has the repo:

Run:

pwd
ls -la
test -f package.json

inside /workspace/repo.

If package.json is missing, fail with a clear error.

Command execution inside Tensorlake

Commands must run inside /workspace/repo.

Use the Tensorlake SDK or runtime process APIs to execute commands.

Every command must capture:

- stdout
- stderr
- exit code
- duration
- timeout
- command
- args
- sandboxId

Do not use a shell string unless absolutely necessary.

Preferred:

runCommand("npm", ["test"])

Avoid:

runCommand("sh", ["-lc", "npm test"])

If the SDK requires shell usage, keep command construction safe and do not interpolate user strings.

Command allowlist

Keep the same command safety model as Test 1.

Allowed commands by default:

- npm install
- npm ci
- npm test
- npm run build
- pnpm install
- pnpm test
- pnpm run build
- yarn install
- yarn test
- yarn build

For built-in fixtures, default to:

install: ["npm", "install"]
test: ["npm", "test"]
build: ["npm", "run", "build"]

Do not let arbitrary command strings from the frontend become shell commands.

For API input, accept arrays:

["npm", "test"]

not strings:

"npm test"

Validate commands with Zod.

Repair loop with Tensorlake

The repair loop must be the same as Test 1.

Pseudo-code:

create run record
runner = RunnerFactory.create(request.runner)

workspace = await runner.prepareWorkspace(source)

installResult = await runner.runCommand(workspace, install[0], install.slice(1))

if install fails:
  mark run failed
  cleanup depending on config
  stop

for attemptNumber in 1..maxAttempts:
  testResult = await runner.runCommand(workspace, test[0], test.slice(1))

  if testResult.success:
    if runBuildAfterTestsPass:
      buildResult = await runner.runCommand(workspace, build[0], build.slice(1))
      if buildResult.success:
        mark passed
      else:
        mark failed
    else:
      mark passed
    cleanup depending on config
    stop

  filesForRepair = await gatherRelevantFiles(runner, workspace, source, testResult)

  patch = await repairEngine.proposePatch({
    source,
    attemptNumber,
    commandResult: testResult,
    files: filesForRepair
  })

  if patch.kind === "no_patch":
    mark failed
    cleanup depending on config
    stop

  await patchApplier.applyPatch(runner, workspace, patch)

  record patch
  continue

mark failed if max attempts exhausted
cleanup depending on config

Important:

PatchApplier should use runner.writeFile so it works for both local and Tensorlake.

Do not have separate patch appliers for local and Tensorlake unless absolutely necessary.

Patch format

Keep the same structured patch format from Test 1.

Only support replace_file edits for now:

{
  "summary": "Fix invoice calculation order and final rounding.",
  "edits": [
    {
      "path": "src/calculateInvoice.ts",
      "mode": "replace_file",
      "content": "..."
    }
  ]
}

Validate with Zod.

Rules:

- path must be relative
- path must not contain ..
- mode must be replace_file
- content must be string
- write only inside /workspace/repo for Tensorlake
- write only inside temp workspace for local

Built-in fixtures

Keep the same 3 built-in fixtures:

fixtures/
  invoice-calculator-bug/
  markdown-parser-bug/
  todo-api-bug/

Each one must still:

- fail before patch
- pass after patch
- work with local runner
- work with Tensorlake runner

The Tensorlake mode must prove the same repair behavior inside the remote sandbox.

For each fixture, the run should show:

1. npm install inside Tensorlake
2. first npm test fails inside Tensorlake
3. repair patch applied inside Tensorlake
4. second npm test passes inside Tensorlake
5. npm run build passes inside Tensorlake, if enabled

User-provided repos

Keep support for:

1. local path
2. uploaded zip

For Tensorlake mode:

- local path repo should be copied locally into a staging temp directory first, then uploaded/copied into Tensorlake
- uploaded zip should be extracted into a staging temp directory first, then uploaded/copied into Tensorlake
- do not run user repo code locally in Tensorlake mode
- all install/test/build commands must happen inside Tensorlake

For custom repos:

- automatic fixing can still be NoopRepairEngine unless a real LLM is configured
- but command execution should work in Tensorlake
- the app should run install/test/build and show logs
- the app should clearly say that automatic patching for arbitrary custom repos requires a real LLM repair engine

Frontend updates

Update the UI to support runner selection.

On dashboard:

Show a runner selector:

- Local
- Tensorlake

If Tensorlake is not configured:

- disable Tensorlake option
- show message:
  “Tensorlake is not configured. Set TENSORLAKE_API_KEY in the backend environment.”

On run detail page, show:

- runner type
- sandbox id
- sandbox image
- sandbox status if available
- remote workspace path
- whether sandbox was cleaned up or kept
- command logs
- attempts
- patch summary
- changed files
- final status

Add a small “Tensorlake metadata” section:

{
  "sandboxId": "...",
  "image": "tensorlake/ubuntu-minimal",
  "remoteRoot": "/workspace/repo",
  "createdAt": "...",
  "cleanup": "terminated | kept | failed"
}

SQLite changes

Extend the existing DB.

runs table should include:

- runner
- tensorlake_sandbox_id
- tensorlake_sandbox_name
- tensorlake_image
- tensorlake_remote_root
- tensorlake_cleanup_status

commands table should include:

- runner
- sandbox_id nullable
- remote_cwd nullable

Store enough metadata to debug a failed run later.

Backend API changes

Update POST /api/runs request schema.

Add:

runner: "local" | "tensorlake"

If omitted, use RUNNER_DEFAULT.

Example:

{
  "runner": "tensorlake",
  "source": {
    "type": "fixture",
    "fixtureId": "invoice-calculator-bug"
  },
  "maxAttempts": 3,
  "commands": {
    "install": ["npm", "install"],
    "test": ["npm", "test"],
    "build": ["npm", "run", "build"]
  },
  "runBuildAfterTestsPass": true
}

Update response shape to include runner metadata.

Example final run response:

{
  "id": "run_123",
  "runner": "tensorlake",
  "status": "passed",
  "source": {
    "type": "fixture",
    "fixtureId": "invoice-calculator-bug"
  },
  "tensorlake": {
    "sandboxId": "sbx_...",
    "image": "tensorlake/ubuntu-minimal",
    "remoteRoot": "/workspace/repo",
    "cleanupStatus": "terminated"
  },
  "attempts": [
    {
      "attemptNumber": 1,
      "phase": "initial_test",
      "status": "failed",
      "commands": [
        {
          "command": "npm",
          "args": ["test"],
          "runner": "tensorlake",
          "sandboxId": "sbx_...",
          "exitCode": 1,
          "durationMs": 2300,
          "stdout": "...",
          "stderr": "...",
          "timedOut": false
        }
      ],
      "patch": null
    },
    {
      "attemptNumber": 2,
      "phase": "after_patch",
      "status": "passed",
      "patch": {
        "summary": "Fix invoice calculation order and final rounding.",
        "changedFiles": ["src/calculateInvoice.ts"]
      },
      "commands": [
        {
          "command": "npm",
          "args": ["test"],
          "runner": "tensorlake",
          "sandboxId": "sbx_...",
          "exitCode": 0,
          "durationMs": 1800,
          "stdout": "...",
          "stderr": "",
          "timedOut": false
        },
        {
          "command": "npm",
          "args": ["run", "build"],
          "runner": "tensorlake",
          "sandboxId": "sbx_...",
          "exitCode": 0,
          "durationMs": 1600,
          "stdout": "...",
          "stderr": "",
          "timedOut": false
        }
      ]
    }
  ],
  "finalStatus": "passed",
  "changedFiles": ["src/calculateInvoice.ts"]
}

Verification commands

After implementation, I should be able to run:

npm install
npm test
npm run build

Then:

export TENSORLAKE_API_KEY=tl_apiKey_xxx
npm run dev

Verify config:

curl http://localhost:8787/api/config

Expected:

{
  "tensorlake": {
    "configured": true
  }
}

Verify fixtures:

curl http://localhost:8787/api/fixtures

Run invoice fixture with Tensorlake:

curl -X POST http://localhost:8787/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "runner": "tensorlake",
    "source": {
      "type": "fixture",
      "fixtureId": "invoice-calculator-bug"
    },
    "maxAttempts": 3,
    "commands": {
      "install": ["npm", "install"],
      "test": ["npm", "test"],
      "build": ["npm", "run", "build"]
    },
    "runBuildAfterTestsPass": true
  }'

The response, or the follow-up GET, must show:

- runner is tensorlake
- sandboxId exists
- npm install ran inside Tensorlake
- first npm test failed
- patch was applied
- second npm test passed
- npm run build passed
- changedFiles includes src/calculateInvoice.ts

Also verify the other fixtures:

- markdown-parser-bug
- todo-api-bug

Each must pass in Tensorlake mode after patching.

Important error handling

Handle these cases gracefully:

1. TENSORLAKE_API_KEY missing
2. sandbox creation fails
3. repo copy/upload fails
4. package.json missing in remote workspace
5. npm install fails
6. npm test fails and no patch exists
7. patch writes invalid path
8. command times out
9. sandbox cleanup fails
10. Tensorlake API returns an error
11. stdout/stderr is too large
12. network interruption while waiting for command result

Never crash the backend process because one run fails.

Record the error in the run history.

Frontend should show a readable error.

Testing requirements

Add or update tests.

Unit tests:

- RunnerFactory returns LocalRunner for "local"
- RunnerFactory returns TensorlakeRunner for "tensorlake" when configured
- RunnerFactory errors cleanly when Tensorlake key is missing
- PatchApplier works through the generic Runner interface
- command arrays are validated and unsafe commands are rejected
- path traversal is rejected
- config endpoint hides the API key

Integration tests:

- local runner still works
- built-in fixture repair still works with local runner
- TensorlakeRunner should have tests with a mocked Tensorlake client
- mocked TensorlakeRunner test should verify:
  - sandbox is created
  - files are copied
  - install command runs
  - test command runs
  - patch writes file
  - second test command runs
  - cleanup is called

Optional live test:

Add a script:

npm run test:tensorlake:live

This should run only when TENSORLAKE_API_KEY is set.

It should execute one real fixture in Tensorlake and assert that it passes after patch.

Do not make live Tensorlake tests part of the default npm test, because CI may not have credentials.

Scripts

Add root scripts:

npm run test
npm run test:tensorlake:mock
npm run test:tensorlake:live
npm run dev
npm run build

README updates

Update README with a new Tensorlake section.

Explain:

- Test 1 was local-only
- Test 2 adds Tensorlake Sandbox execution
- Tensorlake mode runs repo commands in an isolated sandbox instead of the local machine
- Local mode still exists
- How to get/set TENSORLAKE_API_KEY
- How to run the app
- How to run a fixture with Tensorlake
- How to debug failed sandbox runs
- How to keep sandboxes for debugging with TENSORLAKE_KEEP_SANDBOXES=true
- Which docs were used

Include links:

- https://docs.tensorlake.ai/sandboxes/introduction
- https://docs.tensorlake.ai/platform/authentication
- https://docs.tensorlake.ai/sandboxes/lifecycle
- https://docs.tensorlake.ai/api-reference/v2/introduction
- https://docs.tensorlake.ai/sandboxes/templates

README must include a clear safety note:

“Tensorlake mode is intended to avoid running untrusted package scripts directly on your machine. Local mode still runs code locally and should only be used with trusted repos.”

Optional bonus: prepared sandbox snapshots

Do this only if the main Tensorlake runner is fully working.

Add an optional optimization:

TENSORLAKE_USE_PREPARED_SNAPSHOT=true

Behavior:

1. Create sandbox
2. Copy fixture repo
3. Run npm install
4. Create snapshot or template after dependencies are installed
5. For repair attempts, restore from the prepared state
6. Run tests faster without reinstalling dependencies every time

But keep this optional.

Do not break the normal one-sandbox-per-run flow.

If implemented, expose metadata:

{
  "snapshotId": "...",
  "restoredFromSnapshot": true
}

This bonus should be clearly separated in the code and README.

Do not implement snapshot support if it makes the main feature unstable.

What not to do

Do not remove LocalRunner.
Do not rewrite the entire app unnecessarily.
Do not fake Tensorlake command results.
Do not make frontend results hardcoded.
Do not run install/test/build locally when runner is tensorlake.
Do not expose TENSORLAKE_API_KEY to frontend.
Do not accept arbitrary shell commands.
Do not use shell: true unless the SDK absolutely requires it.
Do not mutate original fixture repos.
Do not skip real npm install inside Tensorlake.
Do not skip real npm test inside Tensorlake.
Do not skip rerunning tests after patch.
Do not pretend custom repo repair works without a real LLM.
Do not make live Tensorlake tests required for normal npm test.

Success criteria

The project is successful when:

1. npm install works
2. npm test passes without Tensorlake credentials
3. npm run build passes
4. local runner still works exactly like Test 1
5. Tensorlake runner is available when TENSORLAKE_API_KEY is set
6. GET /api/config shows Tensorlake configuration status
7. POST /api/runs with runner=local works
8. POST /api/runs with runner=tensorlake works
9. invoice-calculator-bug fails first, gets patched, passes tests, and passes build inside Tensorlake
10. markdown-parser-bug fails first, gets patched, passes tests, and passes build inside Tensorlake
11. todo-api-bug fails first, gets patched, passes tests, and passes build inside Tensorlake
12. frontend shows runner type, sandbox id, attempts, logs, patches, changed files, and final status
13. SQLite stores Tensorlake metadata
14. sandbox cleanup behavior is controlled by env config
15. errors are recorded cleanly instead of crashing the backend
16. README explains setup and verification clearly

Final output expected from you

After implementation, summarize:

- What changed from Test 1
- Where TensorlakeRunner lives
- How Tensorlake is configured
- How repo files are copied into the sandbox
- How commands are executed inside the sandbox
- How patches are applied inside the sandbox
- How to run the invoice fixture with curl
- How to run all three fixture tests
- How to switch between local and Tensorlake mode
- What docs you used
- Any incomplete pieces or assumptions

Also include the exact curl commands I can use to verify the Tensorlake flow.
