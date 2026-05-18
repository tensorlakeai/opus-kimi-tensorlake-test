import { randomUUID } from "node:crypto";
import type {
  AttemptPhase,
  AttemptStatus,
  AttemptView,
  CommandResult,
  CommandsConfig,
  RepoSource,
  RunStatus,
  RunSummary,
  RunView,
} from "@ai-fix-runner/shared";
import type { Db } from "./sqlite.js";

export interface CreateRunInput {
  source: RepoSource;
  maxAttempts: number;
  commands: CommandsConfig;
}

export interface CreateAttemptInput {
  runId: string;
  attemptNumber: number;
  phase: AttemptPhase;
}

export interface CompleteRunInput {
  finalStatus: RunStatus;
  errorMessage?: string;
  changedFiles: string[];
}

interface RunRow {
  id: string;
  source_type: string;
  source_id: string | null;
  status: RunStatus;
  final_status: RunStatus | null;
  max_attempts: number;
  changed_files_json: string;
  error_message: string | null;
  commands_json: string;
  source_json: string;
  created_at: string;
  updated_at: string;
}

interface AttemptRow {
  id: string;
  run_id: string;
  attempt_number: number;
  phase: AttemptPhase;
  status: AttemptStatus;
  patch_summary: string | null;
  changed_files_json: string | null;
  created_at: string;
}

interface CommandRow {
  id: string;
  attempt_id: string;
  command: string;
  args_json: string;
  cwd: string;
  exit_code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: number;
  truncated: number;
  started_at: string;
  finished_at: string;
  created_at: string;
}

export class RunStore {
  constructor(private readonly db: Db) {}

  createRun(input: CreateRunInput): { id: string; createdAt: string } {
    const id = randomUUID();
    const now = new Date().toISOString();
    const sourceId =
      input.source.type === "fixture"
        ? input.source.fixtureId
        : input.source.type === "upload"
          ? input.source.uploadId
          : input.source.path;
    this.db
      .prepare(
        `INSERT INTO runs (id, source_type, source_id, status, max_attempts, changed_files_json, commands_json, source_json, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', ?, '[]', ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.source.type,
        sourceId,
        input.maxAttempts,
        JSON.stringify(input.commands),
        JSON.stringify(input.source),
        now,
        now,
      );
    return { id, createdAt: now };
  }

  markRunRunning(runId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE runs SET status = 'running', updated_at = ? WHERE id = ?`,
      )
      .run(now, runId);
  }

  completeRun(
    runId: string,
    status: RunStatus,
    input: CompleteRunInput,
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE runs SET status = ?, final_status = ?, error_message = ?, changed_files_json = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        status,
        input.finalStatus,
        input.errorMessage ?? null,
        JSON.stringify(input.changedFiles),
        now,
        runId,
      );
  }

  createAttempt(input: CreateAttemptInput): { id: string; createdAt: string } {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO attempts (id, run_id, attempt_number, phase, status, created_at)
         VALUES (?, ?, ?, ?, 'running', ?)`,
      )
      .run(id, input.runId, input.attemptNumber, input.phase, now);
    return { id, createdAt: now };
  }

  completeAttempt(attemptId: string, status: AttemptStatus): void {
    this.db
      .prepare(`UPDATE attempts SET status = ? WHERE id = ?`)
      .run(status, attemptId);
  }

  attachPatchToAttempt(
    attemptId: string,
    patch: { summary: string; changedFiles: string[] },
  ): void {
    this.db
      .prepare(
        `UPDATE attempts SET patch_summary = ?, changed_files_json = ? WHERE id = ?`,
      )
      .run(patch.summary, JSON.stringify(patch.changedFiles), attemptId);
  }

  recordCommand(attemptId: string, result: CommandResult): void {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO commands (id, attempt_id, command, args_json, cwd, exit_code, signal, stdout, stderr, duration_ms, timed_out, truncated, started_at, finished_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        attemptId,
        result.command,
        JSON.stringify(result.args),
        result.cwd,
        result.exitCode,
        result.signal,
        result.stdout,
        result.stderr,
        result.durationMs,
        result.timedOut ? 1 : 0,
        result.truncated ? 1 : 0,
        result.startedAt,
        result.finishedAt,
        now,
      );
  }

  getRunView(runId: string): RunView | null {
    const row = this.db
      .prepare(`SELECT * FROM runs WHERE id = ?`)
      .get(runId) as RunRow | undefined;
    if (!row) return null;
    const attemptRows = this.db
      .prepare(
        `SELECT * FROM attempts WHERE run_id = ? ORDER BY created_at ASC`,
      )
      .all(runId) as AttemptRow[];

    const attempts: AttemptView[] = attemptRows.map((a) => {
      const cmdRows = this.db
        .prepare(
          `SELECT * FROM commands WHERE attempt_id = ? ORDER BY created_at ASC`,
        )
        .all(a.id) as CommandRow[];
      const commands: CommandResult[] = cmdRows.map((c) => ({
        command: c.command,
        args: JSON.parse(c.args_json),
        cwd: c.cwd,
        exitCode: c.exit_code,
        signal: c.signal,
        stdout: c.stdout,
        stderr: c.stderr,
        durationMs: c.duration_ms,
        timedOut: c.timed_out === 1,
        truncated: c.truncated === 1,
        success: c.timed_out === 0 && c.exit_code === 0,
        startedAt: c.started_at,
        finishedAt: c.finished_at,
      }));
      const patch =
        a.patch_summary !== null
          ? {
              summary: a.patch_summary,
              changedFiles: a.changed_files_json
                ? JSON.parse(a.changed_files_json)
                : [],
            }
          : null;
      return {
        attemptNumber: a.attempt_number,
        phase: a.phase,
        status: a.status,
        patch,
        commands,
        createdAt: a.created_at,
      };
    });

    return {
      id: row.id,
      status: row.status,
      finalStatus: row.final_status,
      source: JSON.parse(row.source_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      maxAttempts: row.max_attempts,
      attempts,
      changedFiles: JSON.parse(row.changed_files_json),
      errorMessage: row.error_message,
      commands: JSON.parse(row.commands_json),
    };
  }

  listRecentRuns(limit: number): RunSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, status, final_status, source_json, created_at, updated_at,
                (SELECT COUNT(*) FROM attempts WHERE run_id = runs.id) AS attempt_count
         FROM runs ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as Array<
      Pick<RunRow, "id" | "status" | "final_status" | "source_json" | "created_at" | "updated_at"> & {
        attempt_count: number;
      }
    >;
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      finalStatus: r.final_status,
      source: JSON.parse(r.source_json),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      attemptCount: r.attempt_count,
      durationMs:
        new Date(r.updated_at).getTime() - new Date(r.created_at).getTime(),
    }));
  }
}
