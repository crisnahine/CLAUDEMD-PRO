import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { analyzeStyle } from "../../src/analyzers/style-analyzer.js";
import type { StackProfile } from "../../src/analyzers/stack-detector.js";

const TMP = join(process.cwd(), "tests/fixtures/.tmp-naming");

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

describe("Naming convention detection", () => {
  it("detects kebab-case when multi-word files use hyphens", async () => {
    setup({
      "src/stack-detector.ts": "export function detect() {}",
      "src/file-scanner.ts": "export function scan() {}",
      "src/domain-analyzer.ts": "export function analyze() {}",
      "src/style-analyzer.ts": "export function style() {}",
      "src/ci-cd.ts": "export function cicd() {}",
      "src/index.ts": "export {};", // single-word, should be skipped
      "src/types.ts": "export {};", // single-word, should be skipped
      "src/main.ts": "export {};", // single-word, should be skipped
    });
    const result = await analyzeStyle(TMP, tsStack());
    expect(result.namingStyle).toBe("kebab-case");
  });

  it("detects snake_case when multi-word files use underscores", async () => {
    setup({
      "src/stack_detector.ts": "export function detect() {}",
      "src/file_scanner.ts": "export function scan() {}",
      "src/domain_analyzer.ts": "export function analyze() {}",
      "src/index.ts": "export {};",
    });
    const result = await analyzeStyle(TMP, tsStack());
    expect(result.namingStyle).toBe("snake_case");
  });

  it("detects camelCase when multi-word files use mixed case", async () => {
    setup({
      "src/stackDetector.ts": "export function detect() {}",
      "src/fileScanner.ts": "export function scan() {}",
      "src/domainAnalyzer.ts": "export function analyze() {}",
      "src/index.ts": "export {};",
    });
    const result = await analyzeStyle(TMP, tsStack());
    expect(result.namingStyle).toBe("camelCase");
  });

  it("detects PascalCase when files start with uppercase", async () => {
    setup({
      "src/StackDetector.ts": "export function detect() {}",
      "src/FileScanner.ts": "export function scan() {}",
      "src/DomainAnalyzer.ts": "export function analyze() {}",
      "src/index.ts": "export {};",
    });
    const result = await analyzeStyle(TMP, tsStack());
    expect(result.namingStyle).toBe("PascalCase");
  });

  it("returns null when all files are single-word (ambiguous)", async () => {
    setup({
      "src/index.ts": "export {};",
      "src/types.ts": "export {};",
      "src/main.ts": "export {};",
      "src/utils.ts": "export {};",
      "src/config.ts": "export {};",
    });
    const result = await analyzeStyle(TMP, tsStack());
    expect(result.namingStyle).toBeNull();
  });

  it("kebab-case wins over single-word files that would be noise", async () => {
    // 20 single-word files + 5 kebab-case = kebab should win
    const files: Record<string, string> = {};
    for (const name of ["index", "types", "main", "utils", "config", "app",
      "server", "router", "logger", "auth", "db", "cache", "queue",
      "schema", "model", "view", "store", "hook", "test", "setup"]) {
      files[`src/${name}.ts`] = "export {};";
    }
    files["src/stack-detector.ts"] = "export function detect() {}";
    files["src/file-scanner.ts"] = "export function scan() {}";
    files["src/domain-analyzer.ts"] = "export function analyze() {}";
    files["src/style-analyzer.ts"] = "export function style() {}";
    files["src/ci-cd.ts"] = "export function cicd() {}";
    setup(files);
    const result = await analyzeStyle(TMP, tsStack());
    expect(result.namingStyle).toBe("kebab-case");
  });

  it("includes uncategorized files in naming detection", async () => {
    // Files in non-standard directories that wouldn't be categorized
    setup({
      "src/analyzers/stack-detector.ts": "export function detect() {}",
      "src/analyzers/file-scanner.ts": "export function scan() {}",
      "src/analyzers/domain-analyzer.ts": "export function analyze() {}",
      "src/core/generate.ts": "export {};",
    });
    const result = await analyzeStyle(TMP, tsStack());
    expect(result.namingStyle).toBe("kebab-case");
  });
});
