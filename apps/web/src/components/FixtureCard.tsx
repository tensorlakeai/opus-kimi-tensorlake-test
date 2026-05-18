import React, { useState } from "react";
import type { FixtureMetadata } from "@ai-fix-runner/shared";
import { api } from "../api/client.js";

interface Props {
  fixture: FixtureMetadata;
  onRunStarted: (runId: string) => void;
}

export function FixtureCard({ fixture, onRunStarted }: Props) {
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [building, setBuilding] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const r = await api.startRun({
        source: { type: "fixture", fixtureId: fixture.id },
        maxAttempts,
        commands: fixture.defaultCommands,
        runBuildAfterTestsPass: building,
      });
      onRunStarted(r.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="card">
      <h3>{fixture.name}</h3>
      <p className="desc">{fixture.description}</p>
      <div className="meta">
        Failing area: <code>{fixture.expectedFailingArea}</code>
      </div>
      <div className="meta">
        Install: <code>{fixture.defaultCommands.install.join(" ")}</code>
        <br />
        Test: <code>{fixture.defaultCommands.test.join(" ")}</code>
        <br />
        Build: <code>{fixture.defaultCommands.build.join(" ")}</code>
      </div>
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
          checked={building}
          onChange={(e) => setBuilding(e.target.checked)}
        />
        Run build after tests pass
      </label>
      <button
        className="primary"
        onClick={start}
        disabled={starting}
        style={{ marginTop: 8 }}
      >
        {starting ? "Starting…" : "Run Repair"}
      </button>
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
