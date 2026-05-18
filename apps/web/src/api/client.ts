import type {
  FixtureMetadata,
  PublicConfig,
  RunSummary,
  RunView,
  RunnerKind,
  StartRunRequest,
} from "@ai-fix-runner/shared";

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    throw new Error(
      `${res.status} ${res.statusText}: ${JSON.stringify(detail)}`,
    );
  }
  return (await res.json()) as T;
}

export const api = {
  getConfig: () => jsonFetch<PublicConfig>("/api/config"),
  getFixtures: () =>
    jsonFetch<{ fixtures: FixtureMetadata[] }>("/api/fixtures"),
  startRun: (req: StartRunRequest) =>
    jsonFetch<{ runId: string }>("/api/runs", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  getRun: (id: string) => jsonFetch<RunView>(`/api/runs/${id}`),
  listRuns: () => jsonFetch<{ runs: RunSummary[] }>("/api/runs"),
  uploadZip: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    return (await res.json()) as { uploadId: string };
  },
  startFromUpload: (body: {
    uploadId: string;
    maxAttempts: number;
    commands: StartRunRequest["commands"];
    runBuildAfterTestsPass: boolean;
    runner?: RunnerKind;
  }) =>
    jsonFetch<{ runId: string }>("/api/runs/from-upload", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
