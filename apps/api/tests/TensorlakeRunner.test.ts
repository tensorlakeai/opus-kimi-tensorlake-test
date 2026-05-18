import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * Hoisted fake Sandbox: vi.mock factories run before imports, so we keep the
 * recorder ref in a hoisted bag we can poke from inside each test.
 */
const sandboxState = vi.hoisted(() => ({
  factory: null as null | ((opts: unknown) => FakeSandbox),
}));

interface FakeRunCall {
  command: string;
  args: string[];
  workingDir?: string;
  timeout?: number;
}

interface FakeWriteCall {
  path: string;
  size: number;
}

class FakeSandbox {
  sandboxId: string;
  status: string;
  runCalls: FakeRunCall[] = [];
  writeCalls: FakeWriteCall[] = [];
  files = new Map<string, Uint8Array>();
  terminated = false;
  // Caller-supplied handler that decides what each `run` returns.
  runImpl: (cmd: string, opts: { args?: string[] }) => {
    exitCode: number;
    stdout: string;
    stderr: string;
  };

  constructor(opts: { sandboxId?: string } = {}) {
    this.sandboxId = opts.sandboxId ?? "sbx_fake_0001";
    this.status = "running";
    this.runImpl = () => ({ exitCode: 0, stdout: "", stderr: "" });
  }

  async run(
    command: string,
    options: { args?: string[]; workingDir?: string; timeout?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    this.runCalls.push({
      command,
      args: options.args ?? [],
      workingDir: options.workingDir,
      timeout: options.timeout,
    });
    return this.runImpl(command, options);
  }

  async writeFile(p: string, content: Uint8Array): Promise<void> {
    this.writeCalls.push({ path: p, size: content.byteLength });
    this.files.set(p, content);
  }

  async readFile(p: string): Promise<Uint8Array> {
    const v = this.files.get(p);
    if (!v) throw new Error(`no such file: ${p}`);
    return v;
  }

  async listDirectory(): Promise<{
    entries: Array<{ name: string; isDir: boolean }>;
  }> {
    return { entries: [] };
  }

  async terminate(): Promise<void> {
    this.terminated = true;
  }
}

vi.mock("tensorlake", () => ({
  Sandbox: {
    async create(opts: unknown) {
      if (!sandboxState.factory) {
        sandboxState.factory = () => new FakeSandbox();
      }
      return sandboxState.factory(opts);
    },
  },
}));

// IMPORTANT: import the SUT *after* the mock above so it sees the fake SDK.
import { TensorlakeRunner } from "../src/runner/TensorlakeRunner.js";

let fixturesRoot: string;
let activeSandbox: FakeSandbox;

beforeEach(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "aifix-tlrunner-"));
  fixturesRoot = path.join(base, "fixtures");
  await fs.mkdir(path.join(fixturesRoot, "demo", "src"), { recursive: true });
  await fs.writeFile(
    path.join(fixturesRoot, "demo", "package.json"),
    '{"name":"demo","version":"0.0.0"}',
  );
  await fs.writeFile(
    path.join(fixturesRoot, "demo", "src", "index.ts"),
    "export const x = 1;\n",
  );

  activeSandbox = new FakeSandbox({ sandboxId: "sbx_test_demo" });
  sandboxState.factory = () => activeSandbox;
});

afterEach(() => {
  sandboxState.factory = null;
  vi.restoreAllMocks();
});

function buildRunner(over: Partial<ConstructorParameters<typeof TensorlakeRunner>[0]> = {}) {
  return new TensorlakeRunner({
    apiKey: "tl_apiKey_test",
    fixturesRoot,
    uploadRoot: path.join(fixturesRoot, "_uploads"),
    allowCustomRepoPaths: false,
    maxStdioBytes: 1024,
    commandAllowlist: new Set(["npm", "node", "mkdir", "test"]),
    defaultImage: undefined,
    cpus: undefined,
    memoryMb: undefined,
    diskMb: undefined,
    timeoutSeconds: 600,
    keepSandboxes: false,
    remoteRoot: "/workspace/repo",
    useNamedSandboxes: false,
    sandboxNamePrefix: "ai-fix-runner",
    ...over,
  });
}

describe("TensorlakeRunner", () => {
  it("creates a sandbox, uploads files, and verifies package.json", async () => {
    const runner = buildRunner();
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-tl-1",
    );
    expect(ws.kind).toBe("tensorlake");
    expect(ws.sandboxId).toBe("sbx_test_demo");
    expect(ws.remoteRoot).toBe("/workspace/repo");
    // Both repo files were uploaded.
    const uploadedPaths = activeSandbox.writeCalls.map((c) => c.path);
    expect(uploadedPaths).toContain("/workspace/repo/package.json");
    expect(uploadedPaths).toContain("/workspace/repo/src/index.ts");
    // Probe test ran.
    const probe = activeSandbox.runCalls.find(
      (c) =>
        c.command === "test" &&
        c.args.includes("-f") &&
        c.args.some((a) => a.endsWith("package.json")),
    );
    expect(probe).toBeTruthy();
  });

  it("maps sandbox.run results into the CommandResult shape", async () => {
    const runner = buildRunner();
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-tl-2",
    );
    activeSandbox.runImpl = (cmd) =>
      cmd === "npm"
        ? { exitCode: 0, stdout: "installed\n", stderr: "" }
        : { exitCode: 0, stdout: "", stderr: "" };
    const result = await runner.runCommand(ws, "npm", ["install"], {
      timeoutMs: 60_000,
    });
    expect(result.runner).toBe("tensorlake");
    expect(result.sandboxId).toBe("sbx_test_demo");
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("installed\n");
    expect(result.cwd).toBe("/workspace/repo");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // Verify the SDK got workingDir + timeout in seconds.
    const lastCall = activeSandbox.runCalls.at(-1)!;
    expect(lastCall.command).toBe("npm");
    expect(lastCall.workingDir).toBe("/workspace/repo");
    expect(lastCall.timeout).toBe(60);
  });

  it("marks failures and decodes negative exit codes as signals", async () => {
    const runner = buildRunner();
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-tl-3",
    );
    activeSandbox.runImpl = () => ({
      exitCode: -9,
      stdout: "",
      stderr: "killed",
    });
    const r = await runner.runCommand(ws, "npm", ["test"], {
      timeoutMs: 60_000,
    });
    expect(r.success).toBe(false);
    expect(r.exitCode).toBeNull();
    expect(r.signal).toBe("SIGKILL");
  });

  it("writes patch files through sandbox.writeFile under remoteRoot", async () => {
    const runner = buildRunner();
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-tl-4",
    );
    activeSandbox.writeCalls = []; // reset post-upload
    await runner.writeFile(ws, "src/index.ts", "export const y = 2;\n");
    const last = activeSandbox.writeCalls.at(-1)!;
    expect(last.path).toBe("/workspace/repo/src/index.ts");
  });

  it("rejects path traversal on writeFile", async () => {
    const runner = buildRunner();
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-tl-5",
    );
    await expect(
      runner.writeFile(ws, "../escape.txt", "evil"),
    ).rejects.toThrow();
    await expect(
      runner.writeFile(ws, "/etc/passwd", "evil"),
    ).rejects.toThrow();
  });

  it("terminates the sandbox on cleanup unless keepSandboxes", async () => {
    const runner = buildRunner();
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-tl-6",
    );
    await runner.cleanup(ws);
    expect(activeSandbox.terminated).toBe(true);
    expect(ws.cleanupStatus).toBe("terminated");
  });

  it("respects keepSandboxes=true on cleanup", async () => {
    const runner = buildRunner({ keepSandboxes: true });
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-tl-7",
    );
    await runner.cleanup(ws);
    expect(activeSandbox.terminated).toBe(false);
    expect(ws.cleanupStatus).toBe("kept");
  });

  it("records cleanupStatus=failed when terminate throws", async () => {
    const runner = buildRunner();
    const ws = await runner.prepareWorkspace(
      { type: "fixture", fixtureId: "demo" },
      "run-tl-8",
    );
    activeSandbox.terminate = async () => {
      throw new Error("network down");
    };
    await runner.cleanup(ws);
    expect(ws.cleanupStatus).toBe("failed");
  });
});
