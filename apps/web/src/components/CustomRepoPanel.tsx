import React, { useState } from "react";
import type { PublicConfig, RunnerKind } from "@ai-fix-runner/shared";
import { api } from "../api/client.js";
import { RunnerSelector } from "./RunnerSelector.js";

interface Props {
  cfg: PublicConfig | null;
  onRunStarted: (runId: string) => void;
}

const DEFAULT_COMMANDS = {
  install: ["npm", "install"],
  test: ["npm", "test"],
  build: ["npm", "run", "build"],
} as const;

export function CustomRepoPanel({ cfg, onRunStarted }: Props) {
  const [tab, setTab] = useState<"upload" | "localPath">("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [localPath, setLocalPath] = useState("");
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [buildAfter, setBuildAfter] = useState(true);
  const [runner, setRunner] = useState<RunnerKind>(
    cfg?.defaultRunner ?? "local",
  );

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const r = await api.uploadZip(file);
      setUploadId(r.uploadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startFromUpload() {
    if (!uploadId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.startFromUpload({
        uploadId,
        maxAttempts,
        commands: {
          install: [...DEFAULT_COMMANDS.install],
          test: [...DEFAULT_COMMANDS.test],
          build: [...DEFAULT_COMMANDS.build],
        },
        runBuildAfterTestsPass: buildAfter,
        runner,
      });
      onRunStarted(r.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startFromLocal() {
    if (!localPath) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.startRun({
        source: { type: "localPath", path: localPath },
        maxAttempts,
        commands: {
          install: [...DEFAULT_COMMANDS.install],
          test: [...DEFAULT_COMMANDS.test],
          build: [...DEFAULT_COMMANDS.build],
        },
        runBuildAfterTestsPass: buildAfter,
        runner,
      });
      onRunStarted(r.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Custom repo</h3>
      <div className="warning" style={{ marginBottom: 12 }}>
        Automatic patching is available for built-in fixtures only in Test 1.
        Custom repos will install, test, and build, but if tests fail the run
        will end without proposing a patch (no real LLM is configured).
      </div>
      <nav style={{ marginBottom: 12 }}>
        <button
          className={tab === "upload" ? "active" : ""}
          onClick={() => setTab("upload")}
        >
          Upload zip
        </button>
        <button
          className={tab === "localPath" ? "active" : ""}
          onClick={() => setTab("localPath")}
        >
          Local path
        </button>
      </nav>

      {tab === "upload" && (
        <div>
          <input
            type="file"
            accept=".zip"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          {uploadId && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
              Uploaded as <code>{uploadId}</code>
            </div>
          )}
          <button
            className="primary"
            onClick={startFromUpload}
            disabled={!uploadId || busy}
            style={{ marginTop: 12 }}
          >
            Run on uploaded repo
          </button>
        </div>
      )}

      {tab === "localPath" && (
        <div>
          <label>
            Absolute path to local repo
            <input
              type="text"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="/absolute/path/to/repo"
              disabled={!cfg?.allowCustomRepoPaths}
            />
          </label>
          {!cfg?.allowCustomRepoPaths && (
            <div className="warning" style={{ marginTop: 4 }}>
              Local-path input is disabled. Set{" "}
              <code>ALLOW_CUSTOM_REPO_PATHS=true</code> in <code>.env</code> and
              restart the API to enable it.
            </div>
          )}
          <button
            className="primary"
            onClick={startFromLocal}
            disabled={
              !localPath || busy || !cfg?.allowCustomRepoPaths
            }
            style={{ marginTop: 8 }}
          >
            Run on local repo
          </button>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <label>
          Max attempts
          <input
            type="number"
            min={1}
            max={10}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={buildAfter}
            onChange={(e) => setBuildAfter(e.target.checked)}
          />
          Run build after tests pass
        </label>
        <RunnerSelector cfg={cfg} value={runner} onChange={setRunner} />
      </div>

      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
