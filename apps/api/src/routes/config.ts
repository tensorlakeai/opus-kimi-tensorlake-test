import { Router } from "express";
import type { AppConfig } from "../config.js";

export function configRouter(cfg: AppConfig): Router {
  const r = Router();
  r.get("/api/config", (_req, res) => {
    res.json({
      allowCustomRepoPaths: cfg.allowCustomRepoPaths,
      keepWorkspaces: cfg.keepWorkspaces,
      maxStdioBytes: cfg.maxStdioBytes,
    });
  });
  return r;
}
