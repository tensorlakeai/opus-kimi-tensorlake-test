import { useEffect, useRef, useState } from "react";
import type { RunView } from "@ai-fix-runner/shared";
import { api } from "../api/client.js";

export function useRun(runId: string | null) {
  const [run, setRun] = useState<RunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    if (!runId) {
      setRun(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const r = await api.getRun(runId!);
        if (stopped.current) return;
        setRun(r);
        setError(null);
        if (r.status === "queued" || r.status === "running") {
          timer = setTimeout(poll, 1000);
        }
      } catch (e) {
        if (stopped.current) return;
        setError(e instanceof Error ? e.message : String(e));
        timer = setTimeout(poll, 2000);
      }
    }

    poll();
    return () => {
      stopped.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  return { run, error };
}
