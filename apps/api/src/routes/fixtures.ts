import { Router } from "express";
import { FIXTURE_CATALOG } from "../repair/fixtureCatalog.js";

export function fixturesRouter(): Router {
  const r = Router();
  r.get("/api/fixtures", (_req, res) => {
    res.json({ fixtures: FIXTURE_CATALOG });
  });
  return r;
}
