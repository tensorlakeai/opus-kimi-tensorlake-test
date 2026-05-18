import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// Resolve the repo root from this module's location so the API works the same
// whether it's started from the repo root (dev) or `apps/api` (npm workspaces
// sets cwd to the workspace dir). Both src/config.ts and dist/config.js sit 3
// levels under the repo root.
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

// Load .env from the repo root rather than process.cwd() — npm workspaces
// changes cwd to apps/api, so the default dotenv lookup would miss it.
dotenv.config({ path: path.join(REPO_ROOT, ".env") });

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: z.string().default("./data/ai-fix-runner.sqlite"),
  WORKSPACE_ROOT: z.string().default("./tmp/workspaces"),
  UPLOAD_ROOT: z.string().default("./tmp/uploads"),
  FIXTURES_ROOT: z.string().optional(),
  KEEP_WORKSPACES: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
    .default(false),
  ALLOW_CUSTOM_REPO_PATHS: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
    .default(false),
  MAX_STDIO_BYTES: z.coerce.number().int().min(1024).default(200_000),
});

export type AppConfig = {
  port: number;
  databaseUrl: string;
  workspaceRoot: string;
  uploadRoot: string;
  fixturesRoot: string;
  keepWorkspaces: boolean;
  allowCustomRepoPaths: boolean;
  maxStdioBytes: number;
  installTimeoutMs: number;
  testTimeoutMs: number;
  buildTimeoutMs: number;
  commandAllowlist: ReadonlySet<string>;
};

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const parsed = EnvSchema.parse(process.env);
  // Anchor relative paths against the repo root so behavior is identical
  // regardless of whether the API is launched from the root or from apps/api
  // (npm workspaces sets cwd to apps/api).
  const anchor = REPO_ROOT;
  return {
    port: parsed.PORT,
    databaseUrl: path.resolve(anchor, parsed.DATABASE_URL),
    workspaceRoot: path.resolve(anchor, parsed.WORKSPACE_ROOT),
    uploadRoot: path.resolve(anchor, parsed.UPLOAD_ROOT),
    fixturesRoot: path.resolve(
      anchor,
      parsed.FIXTURES_ROOT ?? "fixtures",
    ),
    keepWorkspaces: parsed.KEEP_WORKSPACES,
    allowCustomRepoPaths: parsed.ALLOW_CUSTOM_REPO_PATHS,
    maxStdioBytes: parsed.MAX_STDIO_BYTES,
    installTimeoutMs: 120_000,
    testTimeoutMs: 60_000,
    buildTimeoutMs: 60_000,
    commandAllowlist: new Set(["npm", "npx", "node", "pnpm", "yarn"]),
    ...overrides,
  };
}
