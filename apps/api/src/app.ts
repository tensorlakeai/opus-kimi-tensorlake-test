import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import type { AppConfig } from "./config.js";
import { configRouter } from "./routes/config.js";
import { fixturesRouter } from "./routes/fixtures.js";
import { healthRouter } from "./routes/health.js";
import { runsRouter } from "./routes/runs.js";
import { uploadsRouter } from "./routes/uploads.js";
import type { RunStore } from "./db/RunStore.js";
import type { RepairLoop } from "./orchestrator/RepairLoop.js";
import type { SerialQueue } from "./orchestrator/runQueue.js";
import type { RunnerFactory } from "./runner/RunnerFactory.js";

export interface AppDeps {
  cfg: AppConfig;
  runStore: RunStore;
  repairLoop: RepairLoop;
  queue: SerialQueue;
  runnerFactory: RunnerFactory;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.use(healthRouter());
  app.use(configRouter(deps.cfg));
  app.use(fixturesRouter());
  app.use(runsRouter(deps));
  app.use(uploadsRouter(deps));

  // 404
  app.use((req, res, next) => {
    if (res.headersSent) return next();
    res.status(404).json({ error: "not found", path: req.path });
  });

  // Error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("[api]", message);
    if (res.headersSent) return;
    res.status(500).json({ error: "internal error", message });
  });

  return app;
}
