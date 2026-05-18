import React from "react";
import type { PublicConfig, RunnerKind } from "@ai-fix-runner/shared";

interface Props {
  cfg: PublicConfig | null;
  value: RunnerKind;
  onChange: (next: RunnerKind) => void;
}

/**
 * Local | Tensorlake toggle. Tensorlake is disabled (with a hint) when the
 * server reports it isn't configured.
 */
export function RunnerSelector({ cfg, value, onChange }: Props) {
  const tlConfigured = cfg?.tensorlake.configured === true;
  const reason =
    cfg?.tensorlake.configured === false ? cfg.tensorlake.reason : null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>
        Runner
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <label
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
          }}
        >
          <input
            type="radio"
            name={`runner-${Math.random().toString(36).slice(2, 8)}`}
            value="local"
            checked={value === "local"}
            onChange={() => onChange("local")}
          />
          Local
        </label>
        <label
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            cursor: tlConfigured ? "pointer" : "not-allowed",
            opacity: tlConfigured ? 1 : 0.5,
          }}
          title={
            tlConfigured
              ? "Run inside a Tensorlake Sandbox"
              : "Tensorlake is not configured. Set TENSORLAKE_API_KEY in the backend environment."
          }
        >
          <input
            type="radio"
            name={`runner-${Math.random().toString(36).slice(2, 8)}`}
            value="tensorlake"
            checked={value === "tensorlake"}
            onChange={() => onChange("tensorlake")}
            disabled={!tlConfigured}
          />
          Tensorlake
        </label>
      </div>
      {!tlConfigured && reason && (
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
          {reason}
        </div>
      )}
    </div>
  );
}
