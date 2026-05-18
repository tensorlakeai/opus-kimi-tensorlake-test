// Copies non-TS assets (fixture-fix .txt files) from src/ to dist/ after tsc.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, "..", "src", "repair", "fixtures", "data");
const dstDir = path.resolve(here, "..", "dist", "repair", "fixtures", "data");

await fs.mkdir(dstDir, { recursive: true });
const entries = await fs.readdir(srcDir);
for (const name of entries) {
  if (!name.endsWith(".txt")) continue;
  await fs.copyFile(path.join(srcDir, name), path.join(dstDir, name));
}
console.log(`Copied ${entries.filter((n) => n.endsWith(".txt")).length} fixture-fix files to dist/`);
