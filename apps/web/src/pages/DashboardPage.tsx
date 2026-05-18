import React, { useEffect, useState } from "react";
import type { FixtureMetadata, PublicConfig } from "@ai-fix-runner/shared";
import { api } from "../api/client.js";
import { FixtureCard } from "../components/FixtureCard.js";
import { CustomRepoPanel } from "../components/CustomRepoPanel.js";

interface Props {
  onNavigate: (page: "run-detail" | "history", runId?: string) => void;
}

export function DashboardPage({ onNavigate }: Props) {
  const [fixtures, setFixtures] = useState<FixtureMetadata[]>([]);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getFixtures(), api.getConfig()])
      .then(([f, c]) => {
        setFixtures(f.fixtures);
        setCfg(c);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  function start(runId: string) {
    onNavigate("run-detail", runId);
  }

  return (
    <div>
      <div className="warning">
        ⚠ Local mode runs <code>npm install</code>, <code>npm test</code>, and{" "}
        <code>npm run build</code> directly on your machine. Use trusted repos
        only. This is <strong>not a sandbox</strong>.
      </div>

      <h2 style={{ marginTop: 24 }}>Built-in fixtures</h2>
      {error && <div className="error-box">{error}</div>}
      <div className="fixture-grid">
        {fixtures.map((f) => (
          <FixtureCard key={f.id} fixture={f} onRunStarted={start} />
        ))}
      </div>

      <CustomRepoPanel cfg={cfg} onRunStarted={start} />
    </div>
  );
}
