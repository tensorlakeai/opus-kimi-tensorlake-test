import React from "react";
import type { CommandResult } from "@ai-fix-runner/shared";

export function CommandLogBlock({ result }: { result: CommandResult }) {
  const cmdline = `${result.command} ${result.args.join(" ")}`;
  return (
    <details>
      <summary>
        <code>{cmdline}</code> — exit {result.exitCode ?? "—"} in{" "}
        {result.durationMs}ms{result.timedOut ? " (timed out)" : ""}
        {result.truncated ? " · truncated" : ""}
      </summary>
      <div className="cmd-meta">cwd: {result.cwd}</div>
      {result.stdout && (
        <div>
          <div className="cmd-meta">stdout</div>
          <pre className="command-log">{result.stdout}</pre>
        </div>
      )}
      {result.stderr && (
        <div>
          <div className="cmd-meta">stderr</div>
          <pre className="command-log">{result.stderr}</pre>
        </div>
      )}
    </details>
  );
}
