import fs from "node:fs/promises";
import path from "node:path";
import type { RepoSource } from "@ai-fix-runner/shared";
import type { AppConfig } from "../config.js";

export interface ResolvedSource {
  absDir: string;
  sourceId: string;
}

/**
 * Resolve a RepoSource to an absolute host directory, applying the same
 * sandboxing rules as LocalRunner did in Test 1: fixtureIds must stay under
 * fixturesRoot, uploadIds must stay under uploadRoot, localPath only works
 * when ALLOW_CUSTOM_REPO_PATHS is on.
 */
export async function resolveSource(
  source: RepoSource,
  cfg: Pick<
    AppConfig,
    "fixturesRoot" | "uploadRoot" | "allowCustomRepoPaths"
  >,
): Promise<ResolvedSource> {
  if (source.type === "fixture") {
    const fixturesRoot = path.resolve(cfg.fixturesRoot);
    const candidate = path.resolve(path.join(fixturesRoot, source.fixtureId));
    if (!candidate.startsWith(fixturesRoot + path.sep)) {
      throw new Error(`Fixture id escapes fixtures root`);
    }
    await assertDir(candidate, `Unknown fixture: ${source.fixtureId}`);
    return { absDir: candidate, sourceId: source.fixtureId };
  }
  if (source.type === "localPath") {
    if (!cfg.allowCustomRepoPaths) {
      throw new Error(
        "Local-path sources are disabled. Set ALLOW_CUSTOM_REPO_PATHS=true to enable.",
      );
    }
    const resolved = path.resolve(source.path);
    await assertDir(resolved, `localPath does not exist: ${resolved}`);
    return { absDir: resolved, sourceId: resolved };
  }
  if (source.type === "upload") {
    const uploadsRoot = path.resolve(cfg.uploadRoot);
    const candidate = path.resolve(path.join(uploadsRoot, source.uploadId));
    if (!candidate.startsWith(uploadsRoot + path.sep)) {
      throw new Error(`Upload id escapes upload root`);
    }
    await assertDir(candidate, `Unknown upload: ${source.uploadId}`);
    return { absDir: candidate, sourceId: source.uploadId };
  }
  throw new Error(`Unsupported source type`);
}

async function assertDir(dir: string, msg: string): Promise<void> {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) throw new Error(msg);
  } catch {
    throw new Error(msg);
  }
}
