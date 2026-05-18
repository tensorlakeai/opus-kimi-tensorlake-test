import { describe, expect, it } from "vitest";
import {
  TensorlakeNotConfiguredError,
  createRunnerFactory,
} from "../src/runner/RunnerFactory.js";
import type { AppConfig } from "../src/config.js";

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    databaseUrl: ":memory:",
    workspaceRoot: "/tmp/ws",
    uploadRoot: "/tmp/up",
    fixturesRoot: "/tmp/fx",
    keepWorkspaces: false,
    allowCustomRepoPaths: false,
    maxStdioBytes: 1024,
    installTimeoutMs: 60_000,
    testTimeoutMs: 60_000,
    buildTimeoutMs: 60_000,
    commandAllowlist: new Set(["npm"]),
    defaultRunner: "local",
    tensorlake: {
      configured: false,
      timeoutSeconds: 900,
      keepSandboxes: false,
      remoteRoot: "/tmp/repo",
      useNamedSandboxes: false,
      sandboxNamePrefix: "ai-fix-runner",
    },
    ...overrides,
  };
}

describe("RunnerFactory", () => {
  it("returns LocalRunner for kind=local", () => {
    const factory = createRunnerFactory(baseConfig());
    const r = factory.create("local");
    expect(r.kind).toBe("local");
  });

  it("throws TensorlakeNotConfiguredError when key missing", () => {
    const factory = createRunnerFactory(baseConfig());
    expect(() => factory.create("tensorlake")).toThrow(
      TensorlakeNotConfiguredError,
    );
  });

  it("returns TensorlakeRunner when configured", () => {
    const cfg = baseConfig({
      tensorlake: {
        configured: true,
        apiKey: "tl_apiKey_test_key_not_real",
        timeoutSeconds: 900,
        keepSandboxes: false,
        remoteRoot: "/tmp/repo",
        useNamedSandboxes: false,
        sandboxNamePrefix: "ai-fix-runner",
      },
    });
    const factory = createRunnerFactory(cfg);
    const r = factory.create("tensorlake");
    expect(r.kind).toBe("tensorlake");
  });
});
