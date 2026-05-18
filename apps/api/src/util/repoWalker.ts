import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_SKIP: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".env",
  ".env.local",
]);

const DEFAULT_SKIP_SUFFIXES = [".log"];

export interface RepoFile {
  relPath: string;
  bytes: Buffer;
}

/**
 * Walks a repo on disk, yielding file contents along with their path relative
 * to `absDir`. Skips node_modules/.git/.env entries and *.log files. Symlinks
 * are followed and yielded as bytes so they don't leak arbitrary host paths.
 *
 * Both LocalRunner (via copyDirectorySafe) and TensorlakeRunner (via
 * sandbox.writeFile) need to exclude the same paths; the rules live here.
 */
export async function* walkRepo(absDir: string): AsyncIterable<RepoFile> {
  const root = path.resolve(absDir);
  yield* walk(root, root);
}

async function* walk(
  root: string,
  current: string,
): AsyncIterable<RepoFile> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (DEFAULT_SKIP.has(entry.name)) continue;
    if (DEFAULT_SKIP_SUFFIXES.some((s) => entry.name.endsWith(s))) continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      yield* walk(root, full);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      try {
        const bytes = await fs.readFile(full);
        const rel = path.relative(root, full);
        // Normalize path separators to POSIX so remote (Linux sandbox) paths
        // are always forward-slash regardless of host OS.
        yield { relPath: rel.split(path.sep).join("/"), bytes };
      } catch {
        // unreadable file — skip rather than fail the whole walk
      }
    }
  }
}
