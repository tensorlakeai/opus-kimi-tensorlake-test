import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import type { RunnerKind } from "@ai-fix-runner/shared";
import { StartRunFromUploadRequestSchema } from "@ai-fix-runner/shared";
import type { AppConfig } from "../config.js";
import type { RunStore } from "../db/RunStore.js";
import type { RepairLoop } from "../orchestrator/RepairLoop.js";
import type { SerialQueue } from "../orchestrator/runQueue.js";
import { extractZipSafe } from "../uploads/zipExtractor.js";
import {
  TensorlakeNotConfiguredError,
  type RunnerFactory,
} from "../runner/RunnerFactory.js";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export interface UploadsRouterDeps {
  cfg: AppConfig;
  runStore: RunStore;
  repairLoop: RepairLoop;
  queue: SerialQueue;
  runnerFactory: RunnerFactory;
}

export function uploadsRouter(deps: UploadsRouterDeps): Router {
  const r = Router();
  const { cfg, runStore, repairLoop, queue, runnerFactory } = deps;

  // Multer stores the raw zip in a temp dir; we extract it ourselves.
  const upload = multer({
    dest: path.join(cfg.uploadRoot, "_incoming"),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  r.post("/api/uploads", upload.single("file"), (req, res, next) => {
    (async () => {
      try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "missing file" });
        if (
          !file.originalname.toLowerCase().endsWith(".zip") &&
          file.mimetype !== "application/zip"
        ) {
          await fs.rm(file.path, { force: true });
          return res
            .status(400)
            .json({ error: "only .zip uploads are accepted" });
        }
        const uploadId = randomUUID();
        const targetDir = path.join(cfg.uploadRoot, uploadId);
        try {
          await extractZipSafe(file.path, targetDir);
        } finally {
          await fs.rm(file.path, { force: true });
        }
        res.status(201).json({
          uploadId,
          filename: file.originalname,
          size: file.size,
        });
      } catch (err) {
        next(err);
      }
    })();
  });

  r.post("/api/runs/from-upload", (req, res, next) => {
    (async () => {
      try {
        const parsed = StartRunFromUploadRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: "invalid request", details: parsed.error.flatten() });
        }
        const {
          uploadId,
          maxAttempts,
          commands,
          runBuildAfterTestsPass,
          runner: requestedRunner,
        } = parsed.data;

        const runner: RunnerKind = requestedRunner ?? cfg.defaultRunner;
        if (runner === "tensorlake" && !cfg.tensorlake.configured) {
          return res.status(400).json({
            error:
              "Tensorlake runner not configured (TENSORLAKE_API_KEY is not set).",
          });
        }

        const dir = path.join(cfg.uploadRoot, uploadId);
        try {
          await fs.stat(dir);
        } catch {
          return res.status(404).json({ error: "unknown uploadId" });
        }

        for (const cmdArr of [commands.install, commands.test, commands.build]) {
          if (!cfg.commandAllowlist.has(cmdArr[0])) {
            return res.status(400).json({
              error: `Command not allowed: ${cmdArr[0]}`,
            });
          }
        }

        const source = { type: "upload" as const, uploadId };
        const { id } = runStore.createRun({
          source,
          maxAttempts,
          commands,
          runner,
        });
        queue.enqueue(async () => {
          let runnerInstance;
          try {
            runnerInstance = runnerFactory.create(runner);
          } catch (err) {
            const message =
              err instanceof TensorlakeNotConfiguredError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : String(err);
            runStore.markRunRunning(id);
            runStore.completeRun(id, "error", {
              finalStatus: "error",
              errorMessage: message,
              changedFiles: [],
            });
            return;
          }
          await repairLoop.run({
            runner: runnerInstance,
            runId: id,
            source,
            maxAttempts,
            commands,
            runBuildAfterTestsPass,
            fixtureId: null,
          });
        });
        res.status(202).json({ runId: id });
      } catch (err) {
        next(err);
      }
    })();
  });

  return r;
}
