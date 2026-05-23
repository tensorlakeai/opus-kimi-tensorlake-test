You are building Test 1 of a larger AI coding-agent benchmark.

The goal is to build a local-only “AI Fix Runner” web app. This first version must NOT use Tensorlake, Docker, remote sandboxes, cloud execution, or any external code runner. It should run everything locally on the developer’s machine.

Later, this app will be extended to use Tensorlake Sandbox, so the architecture must be designed with a clean runner abstraction that can be swapped from LocalRunner to TensorlakeRunner later.

For now, build the local version only.

The app should let a user choose a broken repo, run its tests locally in an isolated temporary working directory, ask an LLM-style repair function to generate a patch, apply that patch, rerun tests, and show the full repair attempt history.

Important: the “fix” is done by a repair loop. The local runner only executes commands and captures logs. The runner must not magically fix anything by itself.

The final result should feel like a tiny local version of a coding agent evaluator.

Core idea:

Broken repo → copy into temp workspace → run tests → capture failure logs → repair function proposes patch → apply patch → rerun tests → show result

Build this as a real full-stack TypeScript project.

Use this stack unless there is a strong reason not to:

- TypeScript everywhere
- Node.js backend
- Express or Fastify backend
- React frontend with Vite
- Vitest for tests
- SQLite for run history
- Zod for request/response validation
- child_process.spawn for local command execution
- fs/promises for copying repos into temporary workspaces
- npm as the default package manager

Do not use Tensorlake in this test.
Do not use Docker.
Do not use Composio.
Do not use remote execution.
Do not rely on external paid APIs for the app to work.
Do not fake successful test results.

The app must work immediately after setup with built-in broken fixture repos.

High-level product

Build a web app called:

AI Fix Runner

It should have:

1. A backend API
2. A frontend UI
3. A local command runner
4. A patch application system
5. Built-in broken fixture repos
6. User repo support
7. Run history
8. A clear path to replacing LocalRunner with TensorlakeRunner later

Main user flow

The user opens the web app and sees:

- A list of built-in broken repos
- An option to provide their own repo
- A “Run Repair” button
- A max attempts selector, default 3
- A command selector or config display showing test/build commands
- A live or near-live log display
- A final status summary

When the user starts a repair run:

1. Backend creates a new run record
2. Backend copies the selected repo into a temporary working directory
3. Backend installs dependencies if needed
4. Backend runs the test command
5. Backend captures stdout, stderr, exit code, duration, and command
6. If tests pass immediately, mark run as passed without patching
7. If tests fail, call the repair function
8. The repair function inspects the failing logs and repo files
9. The repair function returns a structured patch
10. Backend applies the patch to the temp workspace
11. Backend reruns tests
12. Repeat until tests pass or max attempts is reached
13. Backend optionally runs the build command
14. Backend stores all attempts in SQLite
15. Frontend shows the full attempt timeline

For Test 1, the repair function can be implemented locally as a deterministic “mock AI repair engine” for the built-in fixtures, but it must be designed behind an interface so a real model can be plugged in later.

This is very important:

The repair function must not just return “passed”.
It must return actual file edits.
The local runner must rerun real commands after applying edits.
The app must prove the fix by running real tests.

Architecture requirement

Create clear interfaces like:

Runner:
- prepareWorkspace(repoSource): Promise<Workspace>
- runCommand(workspace, command, args, options): Promise<CommandResult>
- readFile(workspace, path): Promise<string>
- writeFile(workspace, path, content): Promise<void>
- listFiles(workspace): Promise<string[]>
- cleanup(workspace): Promise<void>

RepairEngine:
- proposePatch(input): Promise<PatchProposal>

PatchApplier:
- applyPatch(workspace, patch): Promise<AppliedPatchResult>

RepoSource:
- builtInFixture
- localPath
- uploadedZip

This separation matters because Test 2 will replace the local runner with Tensorlake.

The code should make that future replacement obvious.

Local execution design

Use Node’s child_process.spawn to run commands so stdout and stderr can be captured.

Every command result must include:

- command
- args
- cwd
- startedAt
- finishedAt
- durationMs
- exitCode
- signal
- stdout
- stderr
- timedOut
- success

Default timeout:

- npm install: 120 seconds
- npm test: 60 seconds
- npm run build: 60 seconds

Commands must run inside the copied temporary workspace, never inside the original fixture directory.

Do not mutate the original fixture repo.

Use a fresh temp directory for each repair run.

The app should expose the temp workspace path in the backend logs, but the frontend should only show it if debug mode is enabled.

Add a config option:

KEEP_WORKSPACES=true

When enabled, do not delete temp workspaces after runs. This helps debugging.

Security and safety for local runner

This is a local demo, not a secure sandbox. Be honest in the README about that.

Still, implement reasonable safety:

- Only run predefined commands by default
- Do not accept arbitrary shell strings from the frontend
- Use spawn(command, args), not shell interpolation
- Do not use shell: true
- Run commands only inside the copied workspace
- Enforce timeouts
- Limit max stdout/stderr captured per command, for example 200 KB each
- Reject repo paths outside explicitly allowed directories unless ALLOW_CUSTOM_REPO_PATHS=true
- For uploaded zips, extract only into a controlled upload/temp directory
- Prevent path traversal when extracting zips
- Ignore node_modules when copying user repos unless explicitly requested
- Ignore .git by default
- Do not read .env files from user repos into the backend process
- Show a warning that local execution can run package scripts from the repo and should only be used with trusted repos

Built-in broken fixture repos

Create at least 3 built-in broken repos inside:

fixtures/
  invoice-calculator-bug/
  markdown-parser-bug/
  todo-api-bug/

Each fixture repo must be a small real TypeScript project with its own package.json, tests, src files, and README.

Each fixture must start broken.
Each fixture must have tests that fail before repair.
Each fixture must pass after the repair engine applies the correct patch.
Each fixture must be small enough that the bug is understandable from logs and source files.

Fixture 1: invoice-calculator-bug

Purpose:
A small TypeScript library for calculating invoices.

Files:

fixtures/invoice-calculator-bug/
  package.json
  tsconfig.json
  vitest.config.ts
  src/calculateInvoice.ts
  src/calculateInvoice.test.ts
  README.md

Bug:
The calculator rounds each line item too early and applies tax before discount. Correct behavior should be:

- calculate subtotal from quantity * unitPrice
- apply discount to subtotal
- apply tax after discount
- round only the final total to 2 decimals
- reject negative quantity
- reject negative price
- reject discount less than 0 or greater than 1
- reject taxRate less than 0

Tests should include:

- calculates subtotal correctly
- applies percentage discount before tax
- applies tax after discount
- rounds only final total
- rejects negative quantity
- rejects invalid discount
- handles multiple line items

The initial implementation should fail at least 2 tests.

The repair engine should be able to patch src/calculateInvoice.ts.

Fixture 2: markdown-parser-bug

Purpose:
A tiny markdown-to-HTML parser for headings, paragraphs, unordered lists, and code blocks.

Files:

fixtures/markdown-parser-bug/
  package.json
  tsconfig.json
  vitest.config.ts
  src/parser.ts
  src/parser.test.ts
  README.md

Bug:
The parser incorrectly treats hyphens inside normal sentences as list items and breaks fenced code blocks.

Correct behavior:

- "# Hello" becomes "<h1>Hello</h1>"
- normal text becomes paragraph
- lines starting with "- " become unordered list items
- hyphens inside sentences should not create lists
- fenced code blocks using ``` should preserve content
- blank lines separate paragraphs
- list groups should be wrapped in <ul>...</ul>

Tests should include:

- parses h1 headings
- parses paragraphs
- parses unordered lists
- does not treat sentence hyphen as list marker
- preserves fenced code block content
- closes list before paragraph
- handles blank lines

The initial implementation should fail at least 2 tests.

The repair engine should patch src/parser.ts.

Fixture 3: todo-api-bug

Purpose:
A tiny Express API for todos.

Files:

fixtures/todo-api-bug/
  package.json
  tsconfig.json
  vitest.config.ts
  src/app.ts
  src/server.ts
  src/app.test.ts
  README.md

Bug:
PATCH /todos/:id returns the stale todo object and does not validate the completed field properly.

Correct behavior:

- POST /todos creates a todo with id, title, completed false
- GET /todos returns todos
- PATCH /todos/:id can update completed
- PATCH /todos/:id returns the updated todo
- PATCH with invalid completed value returns 400
- PATCH unknown todo returns 404
- empty title returns 400

Tests should include:

- creates todo
- lists todos
- updates completed status
- returns updated todo
- rejects invalid completed type
- returns 404 for missing todo
- rejects empty title

The initial implementation should fail at least 2 tests.

The repair engine should patch src/app.ts.

User-provided repos

Support two user repo input modes:

Mode 1: Local path

Backend endpoint accepts a local path only if ALLOW_CUSTOM_REPO_PATHS=true.

The user can submit:

{
  "type": "localPath",
  "path": "/absolute/path/to/repo",
  "installCommand": "npm install",
  "testCommand": "npm test",
  "buildCommand": "npm run build"
}

But do not accept arbitrary shell strings directly. Parse commands into command + args. Better: accept command arrays:

{
  "install": ["npm", "install"],
  "test": ["npm", "test"],
  "build": ["npm", "run", "build"]
}

Mode 2: Uploaded zip

Frontend allows user to upload a .zip file.

Backend extracts it safely into a temp directory.

The user can then run repair on that uploaded repo.

For user-provided repos, the repair engine may not know how to fix the repo unless a real LLM is configured. That is okay.

Implement this behavior:

- Built-in fixtures use deterministic repair patches
- User repos use a “stub repair engine” that explains no real LLM is configured yet
- The app should still run install/test/build and show logs for user repos
- The UI should clearly say “automatic patching is available for built-in fixtures only in Test 1”

Optional but preferred:

Add a RepairEngine interface and two implementations:

- FixtureRepairEngine
- NoopRepairEngine

FixtureRepairEngine recognizes the fixture id and failing attempt number, then returns a patch.

NoopRepairEngine returns:

{
  "kind": "no_patch",
  "message": "No real LLM repair engine is configured for custom repos in Test 1."
}

Patch format

Use a structured patch format that is easy to validate and apply.

Example:

{
  "summary": "Fix invoice order of operations and rounding.",
  "edits": [
    {
      "path": "src/calculateInvoice.ts",
      "mode": "replace_file",
      "content": "full file content here"
    }
  ]
}

Support only replace_file for now.

This avoids fragile diff parsing.

Validate patch proposals with Zod:

- summary is required
- edits array is required
- path must be relative
- path must not contain ..
- mode must be replace_file
- content must be string

Patch application must refuse to write outside the workspace.

Backend API

Implement these endpoints:

GET /health

Returns:

{
  "ok": true
}

GET /api/fixtures

Returns all built-in fixtures:

{
  "fixtures": [
    {
      "id": "invoice-calculator-bug",
      "name": "Invoice Calculator Bug",
      "description": "...",
      "language": "TypeScript",
      "defaultCommands": {
        "install": ["npm", "install"],
        "test": ["npm", "test"],
        "build": ["npm", "run", "build"]
      }
    }
  ]
}

POST /api/runs

Starts a repair run.

Request for built-in fixture:

{
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

Response:

{
  "runId": "..."
}

For simplicity, the backend can run synchronously and return the full result directly, but preferred behavior is:

- POST /api/runs creates the run and starts processing
- GET /api/runs/:id returns status and results

If implementing async is too much, synchronous is acceptable as long as the UI remains usable.

GET /api/runs/:id

Returns:

{
  "id": "...",
  "status": "queued | running | passed | failed | error",
  "source": {...},
  "createdAt": "...",
  "updatedAt": "...",
  "maxAttempts": 3,
  "attempts": [
    {
      "attemptNumber": 1,
      "phase": "initial_test",
      "commands": [
        {
          "command": "npm",
          "args": ["test"],
          "exitCode": 1,
          "durationMs": 1234,
          "stdout": "...",
          "stderr": "...",
          "timedOut": false
        }
      ],
      "patch": null,
      "status": "failed"
    },
    {
      "attemptNumber": 2,
      "phase": "after_patch",
      "patch": {
        "summary": "Fix invoice calculation order.",
        "changedFiles": ["src/calculateInvoice.ts"]
      },
      "commands": [
        {
          "command": "npm",
          "args": ["test"],
          "exitCode": 0,
          "durationMs": 1000,
          "stdout": "...",
          "stderr": "",
          "timedOut": false
        }
      ],
      "status": "passed"
    }
  ],
  "finalStatus": "passed",
  "changedFiles": ["src/calculateInvoice.ts"]
}

GET /api/runs

Returns recent runs from SQLite.

POST /api/uploads

Accepts a zip file upload and returns an upload id.

POST /api/runs/from-upload

Starts a run from uploaded repo.

Frontend UI

Build a clean UI with these pages or sections:

1. Dashboard
2. Fixture selector
3. Custom repo section
4. Run detail view
5. Run history

Dashboard should show:

- App name: AI Fix Runner
- Short explanation:
  “Run a broken repo locally, capture failing tests, apply a repair patch, and prove the fix by rerunning tests.”
- Warning:
  “Local mode runs package scripts on your machine. Use trusted repos only.”

Fixture selector should show cards:

- Invoice Calculator Bug
- Markdown Parser Bug
- Todo API Bug

Each card should show:

- description
- expected failing area
- commands
- Run Repair button

Run detail should show:

- current status
- final result
- attempts timeline
- command logs
- patch summary
- changed files
- stdout/stderr collapsed sections
- timings
- exit codes

Custom repo section should support:

- local path input, disabled unless backend says ALLOW_CUSTOM_REPO_PATHS=true
- zip upload
- command config
- run button
- clear note that automatic patching is only available for built-in fixtures in Test 1 unless a real repair engine is added

Run history should show:

- run id
- source
- status
- attempts
- duration
- created time
- link to details

SQLite data model

Use SQLite to persist runs.

Tables:

runs:
- id
- source_type
- source_id
- status
- max_attempts
- created_at
- updated_at
- final_status
- changed_files_json
- error_message

attempts:
- id
- run_id
- attempt_number
- phase
- status
- patch_summary
- changed_files_json
- created_at

commands:
- id
- attempt_id
- command
- args_json
- cwd
- exit_code
- signal
- stdout
- stderr
- duration_ms
- timed_out
- created_at

You can use better-sqlite3 or sqlite with a simple wrapper.

Testing requirements

Add tests for the backend core logic.

At minimum:

- LocalRunner runs a command and captures output
- LocalRunner handles non-zero exit code
- LocalRunner times out long-running command
- PatchApplier refuses path traversal
- PatchApplier writes replace_file edits correctly
- FixtureRepairEngine returns a patch for each built-in fixture
- Built-in fixtures fail before patch and pass after patch
- API returns fixture list
- API can start a run for invoice-calculator-bug and eventually pass

The app’s own tests should pass with:

npm test

The app should build with:

npm run build

Root project structure

Use a monorepo-like structure:

ai-fix-runner/
  package.json
  README.md
  .env.example
  apps/
    api/
      package.json
      src/
        index.ts
        app.ts
        routes/
        db/
        runner/
        repair/
        patches/
        uploads/
        types/
      tests/
    web/
      package.json
      src/
        main.tsx
        App.tsx
        api/
        components/
        pages/
      index.html
  packages/
    shared/
      package.json
      src/
        schemas.ts
        types.ts
  fixtures/
    invoice-calculator-bug/
    markdown-parser-bug/
    todo-api-bug/

If you choose a simpler structure, keep the same logical separation.

Root scripts

The root package.json should support:

npm install
npm run dev
npm run build
npm test

Also add:

npm run dev:api
npm run dev:web
npm run db:migrate
npm run fixtures:test

Environment variables

Create .env.example:

PORT=8787
DATABASE_URL=./data/ai-fix-runner.sqlite
WORKSPACE_ROOT=./tmp/workspaces
UPLOAD_ROOT=./tmp/uploads
KEEP_WORKSPACES=false
ALLOW_CUSTOM_REPO_PATHS=false
MAX_STDIO_BYTES=200000

Verification commands

After implementation, I should be able to run:

npm install
npm test
npm run build
npm run dev

Then test from curl:

curl http://localhost:8787/health

curl http://localhost:8787/api/fixtures

curl -X POST http://localhost:8787/api/runs \
  -H "Content-Type: application/json" \
  -d '{
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

The response or follow-up GET should show:

- initial test failed
- patch applied
- test passed after patch
- build passed
- changedFiles includes src/calculateInvoice.ts

Important implementation details

Install phase:

For built-in fixtures, the run should copy the repo to a temp workspace first, then run npm install inside the temp workspace.

Do not run npm install in the original fixture directory.

Command execution:

Use spawn with command and args array.

Do not use exec with shell strings.

Do not use shell: true.

Capture stdout and stderr separately.

Truncate very large output safely and mark it as truncated.

Timeouts should kill the process and mark timedOut=true.

Patch application:

Use replace_file edits only.

Validate paths.

Normalize paths.

Resolve target path and verify it is inside workspace root.

Create parent directories if needed.

Write content.

Track changed files.

Repair loop:

Pseudo-code:

create run
prepare workspace from source
run install command
if install fails:
  mark run failed
  stop

for attemptNumber in 1..maxAttempts:
  run test command
  if test passes:
    if runBuildAfterTestsPass:
      run build command
      if build passes:
        mark passed
      else:
        mark failed
    else:
      mark passed
    stop

  collect logs and relevant files
  ask RepairEngine for patch
  if no patch:
    mark failed
    stop

  apply patch
  record patch
  continue

if max attempts exhausted:
  mark failed

Relevant files for repair:

For built-in fixtures, RepairEngine can know what file to patch.

For future LLM support, create a function that gathers:

- package.json
- failing test files
- likely source files
- stdout/stderr from failed test command

README requirements

Write a strong README that explains:

- What AI Fix Runner is
- Why local mode exists
- How this prepares for Tensorlake mode later
- Setup
- Commands
- Built-in fixtures
- Custom repo support
- Local execution safety warning
- API examples
- Troubleshooting
- How to verify each fixture manually

README should include this note:

“This Test 1 version is intentionally local-only. It is designed so the runner can later be swapped with Tensorlake Sandbox in Test 2.”

What not to do

Do not make a fake demo where tests always pass.
Do not skip actually running tests.
Do not mutate original fixtures.
Do not hardcode frontend results.
Do not use Tensorlake yet.
Do not use Docker.
Do not require a paid LLM API.
Do not make the repair engine edit random files.
Do not accept arbitrary shell commands from the frontend.
Do not hide failing logs.
Do not stop after install unless install fails.
Do not ignore build failures after tests pass.

Success criteria

The project is successful when:

1. npm install works
2. npm test passes for the main app
3. npm run build passes
4. npm run dev starts backend and frontend
5. GET /api/fixtures lists all 3 fixtures
6. Running invoice-calculator-bug shows failed tests first, then a patch, then passing tests
7. Running markdown-parser-bug shows failed tests first, then a patch, then passing tests
8. Running todo-api-bug shows failed tests first, then a patch, then passing tests
9. Run history is saved in SQLite
10. Frontend shows attempts, logs, patches, changed files, exit codes, and final status
11. The architecture clearly separates runner, repair engine, and patch applier
12. The local runner can later be replaced by a Tensorlake runner without rewriting the whole app

Final output expected from you

Build the full project.

After finishing, summarize:

- What you built
- How to run it
- How to verify it with curl
- What fixture repos are included
- What safety limitations local mode has
- Where the LocalRunner abstraction lives
- How TensorlakeRunner can replace it in Test 2

Also mention any parts that are incomplete or intentionally stubbed.
