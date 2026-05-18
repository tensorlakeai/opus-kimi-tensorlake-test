import { z } from "zod";

export const CommandArraySchema = z
  .array(z.string().min(1))
  .min(1)
  .max(32)
  .describe("Command as [executable, ...args]. No shell strings allowed.");

export const CommandsConfigSchema = z.object({
  install: CommandArraySchema,
  test: CommandArraySchema,
  build: CommandArraySchema,
});

export const FixtureSourceSchema = z.object({
  type: z.literal("fixture"),
  fixtureId: z.string().min(1),
});

export const LocalPathSourceSchema = z.object({
  type: z.literal("localPath"),
  path: z.string().min(1),
});

export const UploadSourceSchema = z.object({
  type: z.literal("upload"),
  uploadId: z.string().min(1),
});

export const RepoSourceSchema = z.discriminatedUnion("type", [
  FixtureSourceSchema,
  LocalPathSourceSchema,
  UploadSourceSchema,
]);

export const StartRunRequestSchema = z.object({
  source: RepoSourceSchema,
  maxAttempts: z.number().int().min(1).max(10).default(3),
  commands: CommandsConfigSchema,
  runBuildAfterTestsPass: z.boolean().default(true),
});

export const PatchEditSchema = z.object({
  path: z
    .string()
    .min(1)
    .refine((p) => !p.includes(".."), "path must not contain '..'")
    .refine((p) => !p.startsWith("/"), "path must be relative")
    .refine(
      (p) => !/^[a-zA-Z]:[\\/]/.test(p),
      "path must not be a Windows absolute path",
    ),
  mode: z.literal("replace_file"),
  content: z.string(),
});

export const PatchProposalSchema = z.object({
  kind: z.literal("patch"),
  summary: z.string().min(1),
  edits: z.array(PatchEditSchema).min(1),
});

export const NoPatchProposalSchema = z.object({
  kind: z.literal("no_patch"),
  message: z.string().min(1),
});

export const RepairProposalSchema = z.discriminatedUnion("kind", [
  PatchProposalSchema,
  NoPatchProposalSchema,
]);

export const FixtureMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  language: z.string(),
  expectedFailingArea: z.string(),
  defaultCommands: CommandsConfigSchema,
});

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "passed",
  "failed",
  "error",
]);

export const AttemptPhaseSchema = z.enum([
  "install",
  "initial_test",
  "after_patch",
  "build",
]);

export const AttemptStatusSchema = z.enum([
  "running",
  "passed",
  "failed",
  "error",
]);

export const CommandResultSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  cwd: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number(),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  timedOut: z.boolean(),
  truncated: z.boolean(),
  success: z.boolean(),
});

export const AttemptViewSchema = z.object({
  attemptNumber: z.number(),
  phase: AttemptPhaseSchema,
  status: AttemptStatusSchema,
  patch: z
    .object({
      summary: z.string(),
      changedFiles: z.array(z.string()),
    })
    .nullable(),
  commands: z.array(CommandResultSchema),
  createdAt: z.string(),
});

export const RunViewSchema = z.object({
  id: z.string(),
  status: RunStatusSchema,
  finalStatus: RunStatusSchema.nullable(),
  source: RepoSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  maxAttempts: z.number(),
  attempts: z.array(AttemptViewSchema),
  changedFiles: z.array(z.string()),
  errorMessage: z.string().nullable(),
  commands: CommandsConfigSchema,
});

export const RunSummarySchema = z.object({
  id: z.string(),
  status: RunStatusSchema,
  finalStatus: RunStatusSchema.nullable(),
  source: RepoSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  attemptCount: z.number(),
  durationMs: z.number().nullable(),
});

export const PublicConfigSchema = z.object({
  allowCustomRepoPaths: z.boolean(),
  keepWorkspaces: z.boolean(),
  maxStdioBytes: z.number(),
});

export const FixturesListSchema = z.object({
  fixtures: z.array(FixtureMetadataSchema),
});

export const StartRunResponseSchema = z.object({
  runId: z.string(),
});

export const UploadResponseSchema = z.object({
  uploadId: z.string(),
  filename: z.string(),
  size: z.number(),
});

export const RunListResponseSchema = z.object({
  runs: z.array(RunSummarySchema),
});
