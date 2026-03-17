import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { analyzeArchitecture } from "../../src/analyzers/architecture.js";
import type { StackProfile } from "../../src/analyzers/stack-detector.js";

const TMP = join(process.cwd(), "tests/fixtures/.tmp-arch");

function setup(files: Record<string, string>) {
  mkdirSync(TMP, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const full = join(TMP, path);
    mkdirSync(full.substring(0, full.lastIndexOf("/")), { recursive: true });
    writeFileSync(full, content);
  }
}

afterEach(() => rmSync(TMP, { recursive: true, force: true }));

function tsStack(): StackProfile {
  return {
    language: "typescript",
    framework: "unknown",
    languageVersion: "5.5.0",
    runtimeVersion: "20",
    frameworkVersion: null,
    runtime: "node",
    packageManager: "npm",
    monorepo: false,
    keyDeps: {},
  };
}

function railsStack(): StackProfile {
  return {
    language: "ruby",
    framework: "rails",
    languageVersion: "3.3.0",
    runtimeVersion: "3.3.0",
    frameworkVersion: "7.2.0",
    runtime: "ruby",
    packageManager: "bundler",
    monorepo: false,
    keyDeps: { rails: "7.2.0" },
  };
}

describe("Architecture deep-scan", () => {
  it("lists src/ subdirectories when src has > 10 files", async () => {
    const files: Record<string, string> = {};
    // Create enough files to trigger deep-scan (> 10)
    for (let i = 0; i < 5; i++) {
      files[`src/cli/cmd-${i}.ts`] = "export {};";
    }
    for (let i = 0; i < 5; i++) {
      files[`src/analyzers/analyzer-${i}.ts`] = "export {};";
    }
    files["src/core/generate.ts"] = "export {};";
    files["src/index.ts"] = "export {};";
    setup(files);

    const result = await analyzeArchitecture(TMP, tsStack());
    const paths = result.topLevelDirs.map((d) => d.path);
    expect(paths).toContain("src/cli");
    expect(paths).toContain("src/analyzers");
    expect(paths).toContain("src/core");
  });

  it("does NOT deep-scan src/ when it has <= 10 files", async () => {
    const files: Record<string, string> = {};
    files["src/cli/index.ts"] = "export {};";
    files["src/core/main.ts"] = "export {};";
    files["src/index.ts"] = "export {};";
    setup(files);

    const result = await analyzeArchitecture(TMP, tsStack());
    const paths = result.topLevelDirs.map((d) => d.path);
    expect(paths).toContain("src");
    expect(paths).not.toContain("src/cli");
    expect(paths).not.toContain("src/core");
  });

  it("does NOT deep-scan for Rails (Rails has its own app/ scan)", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 12; i++) {
      files[`app/models/model-${i}.rb`] = "# model";
    }
    files["app/controllers/home_controller.rb"] = "# controller";
    setup(files);

    const result = await analyzeArchitecture(TMP, railsStack());
    const paths = result.topLevelDirs.map((d) => d.path);
    // Should have app/models and app/controllers from Rails scan
    expect(paths).toContain("app/models");
    expect(paths).toContain("app/controllers");
  });

  it("skips empty subdirectories", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 12; i++) {
      files[`src/analyzers/a-${i}.ts`] = "export {};";
    }
    // Create an empty subdir by having a file then a .gitkeep
    mkdirSync(join(TMP, "src/empty-dir"), { recursive: true });
    setup(files);

    const result = await analyzeArchitecture(TMP, tsStack());
    const paths = result.topLevelDirs.map((d) => d.path);
    expect(paths).not.toContain("src/empty-dir");
  });

  it("assigns correct purposes via inferPurpose", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 4; i++) {
      files[`src/cli/cmd-${i}.ts`] = "export {};";
      files[`src/core/core-${i}.ts`] = "export {};";
      files[`src/linter/rule-${i}.ts`] = "export {};";
      files[`src/mcp/mcp-${i}.ts`] = "export {};";
    }
    setup(files);

    const result = await analyzeArchitecture(TMP, tsStack());
    const dirMap = new Map(result.topLevelDirs.map((d) => [d.path, d.purpose]));
    expect(dirMap.get("src/cli")).toBe("CLI entry points and commands");
    expect(dirMap.get("src/core")).toBe("Core shared logic");
    expect(dirMap.get("src/linter")).toBe("Linting rules and engine");
    expect(dirMap.get("src/mcp")).toBe("MCP server integration");
  });

  it("deep-scans lib/ and packages/ too", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 8; i++) {
      files[`lib/utils/u-${i}.ts`] = "export {};";
    }
    for (let i = 0; i < 4; i++) {
      files[`lib/core/c-${i}.ts`] = "export {};";
    }
    setup(files);

    const result = await analyzeArchitecture(TMP, tsStack());
    const paths = result.topLevelDirs.map((d) => d.path);
    expect(paths).toContain("lib/utils");
    expect(paths).toContain("lib/core");
  });
});
