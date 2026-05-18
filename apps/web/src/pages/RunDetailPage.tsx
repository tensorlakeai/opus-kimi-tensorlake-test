import React from "react";
import { AttemptTimeline } from "../components/AttemptTimeline.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { useRun } from "../state/useRun.js";

interface Props {
  runId: string;
  onBack: () => void;
}

export function RunDetailPage({ runId, onBack }: Props) {
  const { run, error } = useRun(runId);

  if (error) {
    return (
      <div>
        <button onClick={onBack}>← Back</button>
        <div className="error-box">{error}</div>
      </div>
    );
  }
  if (!run) {
    return (
      <div>
        <button onClick={onBack}>← Back</button>
        <p>Loading…</p>
      </div>
    );
  }

  const sourceLabel =
    run.source.type === "fixture"
      ? `fixture: ${run.source.fixtureId}`
      : run.source.type === "upload"
        ? `upload: ${run.source.uploadId}`
        : `local path: ${run.source.path}`;

  return (
    <div>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Run {run.id.slice(0, 8)}</h2>
        <StatusBadge status={run.status} />
        {run.finalStatus && run.finalStatus !== run.status && (
          <span style={{ color: "#9ca3af", fontSize: 13 }}>
            (final: {run.finalStatus})
          </span>
        )}
      </div>
      <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
        Source: <code>{sourceLabel}</code> · Max attempts: {run.maxAttempts} ·
        Runner: <code>{run.runner}</code>
      </p>
      {run.runner === "tensorlake" && run.tensorlake && (
        <div
          className="patch-summary"
          style={{ marginTop: 8, fontSize: 13 }}
        >
          <strong>Tensorlake sandbox</strong>
          <div style={{ marginTop: 4, lineHeight: 1.5 }}>
            <div>
              sandboxId: <code>{run.tensorlake.sandboxId ?? "(pending)"}</code>
            </div>
            {run.tensorlake.sandboxName && (
              <div>
                name: <code>{run.tensorlake.sandboxName}</code>
              </div>
            )}
            <div>
              image:{" "}
              <code>
                {run.tensorlake.image ?? "(managed default)"}
              </code>
            </div>
            <div>
              remoteRoot: <code>{run.tensorlake.remoteRoot}</code>
            </div>
            <div>
              cleanup:{" "}
              <code>{run.tensorlake.cleanupStatus ?? "in progress"}</code>
            </div>
          </div>
        </div>
      )}
      {run.errorMessage && (
        <div className="error-box">{run.errorMessage}</div>
      )}
      {run.changedFiles.length > 0 && (
        <div className="patch-summary">
          <strong>Changed files in this run:</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {run.changedFiles.map((f) => (
              <li key={f} className="changed-file">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      <h3 style={{ marginTop: 24 }}>Attempts</h3>
      <AttemptTimeline attempts={run.attempts} />
    </div>
  );
}
