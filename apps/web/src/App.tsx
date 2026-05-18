import React, { useState } from "react";
import { DashboardPage } from "./pages/DashboardPage.js";
import { RunDetailPage } from "./pages/RunDetailPage.js";
import { RunHistoryPage } from "./pages/RunHistoryPage.js";

type Page = "dashboard" | "run-detail" | "history";

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  function goto(p: Page, runId?: string) {
    if (runId) setOpenRunId(runId);
    setPage(p);
  }

  return (
    <div className="app">
      <header>
        <h1>AI Fix Runner</h1>
        <p className="tagline">
          Run a broken repo locally, capture failing tests, apply a repair
          patch, and prove the fix by rerunning tests. Test 1 of the
          coding-agent benchmark — local mode only.
        </p>
        <nav>
          <button
            className={page === "dashboard" ? "active" : ""}
            onClick={() => goto("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={page === "history" ? "active" : ""}
            onClick={() => goto("history")}
          >
            Run history
          </button>
        </nav>
      </header>

      {page === "dashboard" && <DashboardPage onNavigate={goto} />}
      {page === "history" && (
        <RunHistoryPage
          onOpen={(id) => {
            setOpenRunId(id);
            setPage("run-detail");
          }}
        />
      )}
      {page === "run-detail" && openRunId && (
        <RunDetailPage runId={openRunId} onBack={() => setPage("dashboard")} />
      )}

      <footer>
        Test 1: local runner only. Test 2 will swap{" "}
        <code>LocalRunner</code> for a <code>TensorlakeRunner</code> against the
        same interface.
      </footer>
    </div>
  );
}
