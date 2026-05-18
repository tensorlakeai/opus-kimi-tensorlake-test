import { Router } from "express";
import type { PublicConfig } from "@ai-fix-runner/shared";
import type { AppConfig } from "../config.js";

export function configRouter(cfg: AppConfig): Router {
  const r = Router();
  r.get("/api/config", (_req, res) => {
    const tensorlake = cfg.tensorlake.configured
      ? {
          configured: true as const,
          defaultImage: cfg.tensorlake.defaultImage ?? null,
        }
      : {
          configured: false as const,
          reason: "TENSORLAKE_API_KEY is not set",
        };

    const payload: PublicConfig = {
      allowCustomRepoPaths: cfg.allowCustomRepoPaths,
      keepWorkspaces: cfg.keepWorkspaces,
      maxStdioBytes: cfg.maxStdioBytes,
      defaultRunner: cfg.defaultRunner,
      availableRunners: cfg.tensorlake.configured
        ? ["local", "tensorlake"]
        : ["local"],
      tensorlake,
    };
    res.json(payload);
  });
  return r;
}
