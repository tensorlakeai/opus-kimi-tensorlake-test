# todo-api-bug

A tiny Express + TypeScript todo API. **It ships intentionally broken.**

## The bug

`src/app.ts` has three problems:

1. `POST /todos` accepts empty / non-string `title` values.
2. `PATCH /todos/:id` does not validate that `completed` is a boolean.
3. `PATCH /todos/:id` returns the **stale** todo (a snapshot taken before mutation) instead of the updated record.

## Correct behavior

- `POST /todos` — body `{ title: string (non-empty) }` → `201` with the new todo. Empty or non-string title → `400`.
- `GET /todos` — returns `{ todos: Todo[] }`.
- `PATCH /todos/:id` — body may include `completed: boolean` and/or `title: string (non-empty)`. Invalid types → `400`. Unknown id → `404`. On success → `200` with the **updated** record.

## How AI Fix Runner uses this

The repo is copied to a temp workspace, `npm install` runs, `npm test` fails (multiple supertest assertions), the `FixtureRepairEngine` replaces `src/app.ts`, tests pass, `tsc --noEmit` passes.
