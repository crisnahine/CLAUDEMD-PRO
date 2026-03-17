import { describe, it, expect } from "vitest";
import { renderClaudeMd } from "../../src/core/generate.js";
import type { CodebaseProfile } from "../../src/analyzers/index.js";

function minimalProfile(stackOverrides: Partial<CodebaseProfile["stack"]> = {}): CodebaseProfile {
  return {
    rootDir: "/tmp/test",
    stack: {
      language: "typescript",
      framework: "unknown",
      languageVersion: "5.5.0",
      runtimeVersion: "20",
      frameworkVersion: null,
      runtime: "node",
      packageManager: "npm",
      monorepo: false,
      keyDeps: {},
      ...stackOverrides,
    },
    architecture: { topLevelDirs: [{ path: "src", purpose: "Source code", fileCount: 10 }], entryPoints: [], patterns: [], estimatedSize: "small", totalFiles: 10 },
    commands: { commands: [], devServer: null, hasLinter: false, hasFormatter: false, hasTypecheck: false },
    database: { adapter: "", orm: "", tableCount: 0, hasMigrations: false, migrationDir: "", keyModels: [] },
    testing: { framework: "", testDir: "", hasSystemTests: false, hasFactories: false, hasMocking: false, coverageTool: "" },
    gotchas: { generatedDirs: [], generatedFiles: [], gotchas: [] },
    environment: { envVars: [], hasDocker: false, hasDockerCompose: false, envFiles: [], secretManager: null, hasTypedEnv: false, varGroups: {} },
    cicd: { provider: "", workflowFiles: [], hasDeployStep: false, deployTarget: null, hasDocker: false, hasDockerCompose: false, triggers: [], jobs: [] },
    gitHistory: { isGitRepo: false, insights: [], topChangedFiles: [], recentContributors: 0 },
    fileScan: { totalFiles: 10, categories: {}, uncategorized: [], truncated: false },
    domains: { domains: [], keyFeatures: [], entityCount: 0 },
    style: { conventions: [], namingStyle: null, importStyle: null, exportStyle: null },
    analyzedAt: new Date().toISOString(),
  };
}

describe("Runtime version rendering in Critical Context", () => {
  it("shows both TypeScript and Node.js when they differ", () => {
    const md = renderClaudeMd(minimalProfile({
      languageVersion: "5.5.0",
      runtimeVersion: "20",
    }));
    expect(md).toContain("Typescript 5.5.0");
    expect(md).toContain("Node.js 20");
  });

  it("does NOT show Node.js line when runtimeVersion is null", () => {
    const md = renderClaudeMd(minimalProfile({
      languageVersion: "5.5.0",
      runtimeVersion: null,
    }));
    expect(md).toContain("Typescript 5.5.0");
    expect(md).not.toContain("Node.js");
  });

  it("does NOT show Node.js line when versions are the same (plain JS)", () => {
    const md = renderClaudeMd(minimalProfile({
      language: "javascript",
      languageVersion: "20",
      runtimeVersion: "20",
    }));
    expect(md).toContain("Javascript 20");
    expect(md).not.toContain("Node.js");
  });

  it("does NOT show Node.js line for non-JS languages", () => {
    const md = renderClaudeMd(minimalProfile({
      language: "python",
      languageVersion: "3.12",
      runtimeVersion: "3.12",
    }));
    expect(md).toContain("Python 3.12");
    expect(md).not.toContain("Node.js");
  });

  it("shows Node.js >=20.0.0 with prefix intact", () => {
    const md = renderClaudeMd(minimalProfile({
      languageVersion: "5.6.0",
      runtimeVersion: ">=20.0.0",
    }));
    expect(md).toContain("Node.js >=20.0.0");
  });
});
