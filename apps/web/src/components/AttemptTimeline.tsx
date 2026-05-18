import React from "react";
import type { AttemptView } from "@ai-fix-runner/shared";
import { CommandLogBlock } from "./CommandLogBlock.js";
import { StatusBadge } from "./StatusBadge.js";

export function AttemptTimeline({ attempts }: { attempts: AttemptView[] }) {
  if (attempts.length === 0) {
    return <p style={{ color: "#6b7280" }}>No attempts yet — run starting…</p>;
  }
  return (
    <div>
      {attempts.map((a, idx) => (
        <div className="attempt" key={`${a.attemptNumber}-${a.phase}-${idx}`}>
          <div className="attempt-header">
            <span className="phase">
              Attempt #{a.attemptNumber} — {phaseLabel(a.phase)}
            </span>
            <StatusBadge status={a.status} />
          </div>
          {a.patch && (
            <div className="patch-summary">
              <strong>Patch applied:</strong> {a.patch.summary}
              <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                {a.patch.changedFiles.map((f) => (
                  <li key={f} className="changed-file">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.commands.map((c, i) => (
            <CommandLogBlock key={i} result={c} />
          ))}
        </div>
      ))}
    </div>
  );
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case "install":
      return "install dependencies";
    case "initial_test":
      return "run tests (initial)";
    case "after_patch":
      return "rerun tests after patch";
    case "build":
      return "build";
    default:
      return phase;
  }
}
