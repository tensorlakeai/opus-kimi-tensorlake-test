import { Router } from "express";
import { StartRunRequestSchema } from "@ai-fix-runner/shared";
import type { AppConfig } from "../config.js";
import type { RunStore } from "../db/RunStore.js";
import type { RepairLoop } from "../orchestrator/RepairLoop.js";
import type { SerialQueue } from "../orchestrator/runQueue.js";
import { FIXTURE_IDS } from "../repair/fixtureCatalog.js";

export interface RunsRouterDeps {
  cfg: AppConfig;
  runStore: RunStore;
  repairLoop: RepairLoop;
  queue: SerialQueue;
}

export function runsRouter(deps: RunsRouterDeps): Router {
  const r = Router();
  const { cfg, runStore, repairLoop, queue } = deps;

  r.post("/api/runs", (req, res, next) => {
    (async () => {
      try {
        const parsed = StartRunRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "invalid request",
            details: parsed.error.flatten(),
          });
        }
        const { source, maxAttempts, commands, runBuildAfterTestsPass } =
          parsed.data;

        // Source-level gating
        if (source.type === "fixture" && !FIXTURE_IDS.has(source.fixtureId)) {
          return res.status(404).json({ error: `Unknown fixture '${source.fixtureId}'` });
        }
        if (source.type === "localPath" && !cfg.allowCustomRepoPaths) {
          return res.status(403).json({
            error:
              "Local-path sources are disabled. Set ALLOW_CUSTOM_REPO_PATHS=true to enable.",
          });
        }

        // Allowlist the root command names
        for (const cmdArr of [commands.install, commands.test, commands.build]) {
          if (!cfg.commandAllowlist.has(cmdArr[0])) {
            return res.status(400).json({
              error: `Command not allowed: ${cmdArr[0]}. Allowed: ${[...cfg.commandAllowlist].join(", ")}`,
            });
          }
        }

        const { id } = runStore.createRun({
          source,
          maxAttempts,
          commands,
        });

        const fixtureId =
          source.type === "fixture" ? source.fixtureId : null;

        queue.enqueue(() =>
          repairLoop.run({
            runId: id,
            source,
            maxAttempts,
            commands,
            runBuildAfterTestsPass,
            fixtureId,
          }),
        );

        res.status(202).json({ runId: id });
      } catch (err) {
        next(err);
      }
    })();
  });

  r.get("/api/runs", (_req, res) => {
    const runs = runStore.listRecentRuns(50);
    res.json({ runs });
  });

  r.get("/api/runs/:id", (req, res) => {
    const run = runStore.getRunView(req.params.id);
    if (!run) return res.status(404).json({ error: "not found" });
    res.json(run);
  });

  return r;
}
