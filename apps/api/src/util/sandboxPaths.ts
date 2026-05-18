/**
 * Validate that `relPath` stays inside the remote workspace and join it under
 * `remoteRoot` as a POSIX path. Mirrors LocalRunner's `resolveInWorkspace`
 * guard but for the sandbox filesystem (always Linux, so POSIX).
 */
export function joinSandboxPath(remoteRoot: string, relPath: string): string {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw new Error("relPath must be a non-empty string");
  }
  if (relPath.startsWith("/")) {
    throw new Error(`Refusing absolute path: ${relPath}`);
  }
  if (/^[a-zA-Z]:[\\/]/.test(relPath)) {
    throw new Error(`Refusing Windows absolute path: ${relPath}`);
  }
  if (relPath.split(/[\\/]/).some((seg) => seg === "..")) {
    throw new Error(`Refusing path with '..' segment: ${relPath}`);
  }
  const root = remoteRoot.replace(/\/+$/, "");
  const cleaned = relPath.split(/[\\/]/).filter((s) => s.length > 0).join("/");
  return `${root}/${cleaned}`;
}

export function posixDirname(p: string): string {
  const idx = p.lastIndexOf("/");
  if (idx <= 0) return idx === 0 ? "/" : ".";
  return p.slice(0, idx);
}
