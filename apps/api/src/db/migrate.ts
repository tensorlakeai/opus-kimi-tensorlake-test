import type { Db } from "./sqlite.js";
import { openDatabase } from "./sqlite.js";
import { loadConfig } from "../config.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT,
  status TEXT NOT NULL,
  final_status TEXT,
  max_attempts INTEGER NOT NULL,
  changed_files_json TEXT NOT NULL DEFAULT '[]',
  error_message TEXT,
  commands_json TEXT NOT NULL,
  source_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  runner TEXT NOT NULL DEFAULT 'local',
  tensorlake_sandbox_id TEXT,
  tensorlake_sandbox_name TEXT,
  tensorlake_image TEXT,
  tensorlake_remote_root TEXT,
  tensorlake_cleanup_status TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  patch_summary TEXT,
  changed_files_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_run_id ON attempts(run_id);

CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  args_json TEXT NOT NULL,
  cwd TEXT NOT NULL,
  exit_code INTEGER,
  signal TEXT,
  stdout TEXT NOT NULL,
  stderr TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  timed_out INTEGER NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  runner TEXT NOT NULL DEFAULT 'local',
  sandbox_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_commands_attempt_id ON commands(attempt_id);
`;

// Columns added in Test 2. CREATE TABLE IF NOT EXISTS won't add new columns to
// an existing table, so we also ALTER conditionally based on PRAGMA table_info
// for databases created before this migration.
const RUNS_NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "runner", ddl: "TEXT NOT NULL DEFAULT 'local'" },
  { name: "tensorlake_sandbox_id", ddl: "TEXT" },
  { name: "tensorlake_sandbox_name", ddl: "TEXT" },
  { name: "tensorlake_image", ddl: "TEXT" },
  { name: "tensorlake_remote_root", ddl: "TEXT" },
  { name: "tensorlake_cleanup_status", ddl: "TEXT" },
];

const COMMANDS_NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "runner", ddl: "TEXT NOT NULL DEFAULT 'local'" },
  { name: "sandbox_id", ddl: "TEXT" },
];

function ensureColumns(
  db: Db,
  table: string,
  cols: Array<{ name: string; ddl: string }>,
): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  const have = new Set(rows.map((r) => r.name));
  for (const c of cols) {
    if (!have.has(c.name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${c.name} ${c.ddl};`);
    }
  }
}

export function migrate(db: Db): void {
  db.exec(SCHEMA);
  ensureColumns(db, "runs", RUNS_NEW_COLUMNS);
  ensureColumns(db, "commands", COMMANDS_NEW_COLUMNS);
}

// Allow running this file directly: npm run db:migrate
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  const cfg = loadConfig();
  const db = openDatabase(cfg.databaseUrl);
  migrate(db);
  // eslint-disable-next-line no-console
  console.log(`Migrated SQLite database at ${cfg.databaseUrl}`);
  db.close();
}
