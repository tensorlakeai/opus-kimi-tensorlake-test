import fs from "node:fs/promises";
import path from "node:path";

interface CopyOptions {
  skip?: ReadonlySet<string>;
}

const DEFAULT_SKIP: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".env",
  ".env.local",
]);

export async function copyDirectorySafe(
  source: string,
  destination: string,
  options: CopyOptions = {},
): Promise<void> {
  const skip = options.skip ?? DEFAULT_SKIP;
  const resolvedSource = path.resolve(source);
  const resolvedDest = path.resolve(destination);

  // Refuse to copy into the source tree
  if (resolvedDest.startsWith(resolvedSource + path.sep)) {
    throw new Error(
      `Refusing to copy: destination ${resolvedDest} is inside source ${resolvedSource}`,
    );
  }

  await fs.mkdir(resolvedDest, { recursive: true });
  await copyRecursive(resolvedSource, resolvedDest, skip);
}

async function copyRecursive(
  source: string,
  destination: string,
  skip: ReadonlySet<string>,
): Promise<void> {
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyRecursive(srcPath, destPath, skip);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      // Resolve and copy as file to avoid leaking arbitrary host paths
      try {
        const data = await fs.readFile(srcPath);
        await fs.writeFile(destPath, data);
      } catch {
        // ignore unreadable symlinks
      }
    }
  }
}

export async function rmSafe(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true });
}
