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

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"));

const optionalPositiveInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.floor(n);
  });

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: z.string().default("./data/ai-fix-runner.sqlite"),
  WORKSPACE_ROOT: z.string().default("./tmp/workspaces"),
  UPLOAD_ROOT: z.string().default("./tmp/uploads"),
  FIXTURES_ROOT: z.string().optional(),
  KEEP_WORKSPACES: boolFromEnv.default(false),
  ALLOW_CUSTOM_REPO_PATHS: boolFromEnv.default(false),
  MAX_STDIO_BYTES: z.coerce.number().int().min(1024).default(200_000),
  RUNNER_DEFAULT: z.enum(["local", "tensorlake"]).default("local"),
  TENSORLAKE_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
  TENSORLAKE_DEFAULT_IMAGE: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
  TENSORLAKE_CPUS: optionalPositiveInt,
  TENSORLAKE_MEMORY_MB: optionalPositiveInt,
  TENSORLAKE_DISK_MB: optionalPositiveInt,
  TENSORLAKE_TIMEOUT_SECONDS: z.coerce.number().int().min(30).default(900),
  TENSORLAKE_KEEP_SANDBOXES: boolFromEnv.default(false),
  TENSORLAKE_REMOTE_ROOT: z.string().default("/tmp/repo"),
  TENSORLAKE_USE_NAMED_SANDBOXES: boolFromEnv.default(false),
  TENSORLAKE_SANDBOX_NAME_PREFIX: z.string().default("ai-fix-runner"),
});

export type RunnerKindConfig = "local" | "tensorlake";

export type TensorlakeConfig = {
  configured: boolean;
  apiKey?: string;
  defaultImage?: string;
  cpus?: number;
  memoryMb?: number;
  diskMb?: number;
  timeoutSeconds: number;
  keepSandboxes: boolean;
  remoteRoot: string;
  useNamedSandboxes: boolean;
  sandboxNamePrefix: string;
};

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
  defaultRunner: RunnerKindConfig;
  tensorlake: TensorlakeConfig;
};

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const parsed = EnvSchema.parse(process.env);
  // Anchor relative paths against the repo root so behavior is identical
  // regardless of whether the API is launched from the root or from apps/api
  // (npm workspaces sets cwd to apps/api).
  const anchor = REPO_ROOT;

  const tensorlakeConfigured = parsed.TENSORLAKE_API_KEY !== undefined;
  const tensorlake: TensorlakeConfig = {
    configured: tensorlakeConfigured,
    apiKey: parsed.TENSORLAKE_API_KEY,
    defaultImage: parsed.TENSORLAKE_DEFAULT_IMAGE,
    cpus: parsed.TENSORLAKE_CPUS,
    memoryMb: parsed.TENSORLAKE_MEMORY_MB,
    diskMb: parsed.TENSORLAKE_DISK_MB,
    timeoutSeconds: parsed.TENSORLAKE_TIMEOUT_SECONDS,
    keepSandboxes: parsed.TENSORLAKE_KEEP_SANDBOXES,
    remoteRoot: parsed.TENSORLAKE_REMOTE_ROOT,
    useNamedSandboxes: parsed.TENSORLAKE_USE_NAMED_SANDBOXES,
    sandboxNamePrefix: parsed.TENSORLAKE_SANDBOX_NAME_PREFIX,
  };

  // RUNNER_DEFAULT can't point at tensorlake when it isn't configured. Fall
  // back to local silently; /api/config surfaces why.
  const defaultRunner: RunnerKindConfig =
    parsed.RUNNER_DEFAULT === "tensorlake" && tensorlakeConfigured
      ? "tensorlake"
      : "local";

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
    defaultRunner,
    tensorlake,
    ...overrides,
  };
}
