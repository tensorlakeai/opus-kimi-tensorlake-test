import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import yauzl from "yauzl";

const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_FILES = 5_000;

/**
 * Safely extracts a zip file into a target directory. Refuses path traversal
 * (entries with `..`, absolute paths, or that resolve outside the target).
 */
export async function extractZipSafe(
  zipPath: string,
  targetDir: string,
): Promise<{ files: number; bytes: number }> {
  const resolvedTarget = path.resolve(targetDir);
  await fsp.mkdir(resolvedTarget, { recursive: true });

  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("failed to open zip"));
      let fileCount = 0;
      let totalBytes = 0;

      zip.readEntry();
      zip.on("entry", (entry: yauzl.Entry) => {
        fileCount += 1;
        if (fileCount > MAX_FILES) {
          zip.close();
          return reject(new Error(`Zip has more than ${MAX_FILES} entries`));
        }
        const name = entry.fileName;
        if (name.includes("\0")) {
          zip.close();
          return reject(new Error("Entry contains null byte"));
        }
        if (path.isAbsolute(name) || name.startsWith("/")) {
          zip.close();
          return reject(new Error(`Refusing absolute entry: ${name}`));
        }
        const dest = path.resolve(resolvedTarget, name);
        if (
          !dest.startsWith(resolvedTarget + path.sep) &&
          dest !== resolvedTarget
        ) {
          zip.close();
          return reject(new Error(`Entry escapes target: ${name}`));
        }

        if (/\/$/.test(name)) {
          fsp.mkdir(dest, { recursive: true }).then(
            () => zip.readEntry(),
            reject,
          );
          return;
        }

        zip.openReadStream(entry, (readErr, stream) => {
          if (readErr || !stream) return reject(readErr ?? new Error("read failed"));
          fsp.mkdir(path.dirname(dest), { recursive: true }).then(() => {
            const out = fs.createWriteStream(dest);
            stream.on("data", (chunk: Buffer) => {
              totalBytes += chunk.length;
              if (totalBytes > MAX_TOTAL_BYTES) {
                zip.close();
                out.destroy();
                reject(
                  new Error(
                    `Extracted contents exceed ${MAX_TOTAL_BYTES} bytes`,
                  ),
                );
              }
            });
            stream.on("end", () => zip.readEntry());
            stream.on("error", reject);
            out.on("error", reject);
            stream.pipe(out);
          }, reject);
        });
      });
      zip.on("end", () => {
        resolve({ files: fileCount, bytes: totalBytes });
      });
      zip.on("error", reject);
    });
  });
}
