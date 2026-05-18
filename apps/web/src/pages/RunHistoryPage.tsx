import React, { useEffect, useState } from "react";
import type { RunSummary } from "@ai-fix-runner/shared";
import { api } from "../api/client.js";
import { StatusBadge } from "../components/StatusBadge.js";

interface Props {
  onOpen: (id: string) => void;
}

export function RunHistoryPage({ onOpen }: Props) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    function fetch() {
      api
        .listRuns()
        .then((r) => {
          if (alive) setRuns(r.runs);
        })
        .catch((e) =>
          alive && setError(e instanceof Error ? e.message : String(e)),
        );
    }
    fetch();
    const t = setInterval(fetch, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (runs.length === 0)
    return <p style={{ color: "#6b7280" }}>No runs yet.</p>;

  return (
    <div className="run-list">
      {runs.map((r) => {
        const src =
          r.source.type === "fixture"
            ? r.source.fixtureId
            : r.source.type === "upload"
              ? `upload:${r.source.uploadId.slice(0, 8)}`
              : `path:${r.source.path}`;
        return (
          <div className="run-row" key={r.id}>
            <a onClick={() => onOpen(r.id)} style={{ cursor: "pointer" }}>
              {r.id.slice(0, 8)}
            </a>
            <span>{src}</span>
            <StatusBadge status={r.status} />
            <span style={{ color: "#9ca3af" }}>
              {r.attemptCount} attempts
            </span>
            <span style={{ color: "#9ca3af", fontSize: 12 }}>
              <code>{r.runner}</code>
            </span>
            <span style={{ color: "#7c8493", fontSize: 12 }}>
              {new Date(r.createdAt).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
