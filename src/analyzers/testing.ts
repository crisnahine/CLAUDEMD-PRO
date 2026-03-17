/**
 * Testing Analyzer - Detects test frameworks, patterns, and coverage setup
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { StackProfile } from "./stack-detector.js";

export interface TestingProfile {
  framework: string | null;
  testDir: string | null;
  hasSystemTests: boolean;
  hasFactories: boolean;
  hasMocking: boolean;
  coverageTool: string | null;
  // Extended fields
  estimatedTestCount: number; // number of test files found
  hasSnapshots: boolean;
  hasPropertyTests: boolean;
  hasComponentTests: boolean;
  hasStorybook: boolean;
  hasBenchmarks: boolean;
  testPattern: string | null; // "describe/it" or "test()" or "ExUnit" etc.
}

export async function analyzeTesting(
  rootDir: string,
  stack: StackProfile
): Promise<TestingProfile> {
  const profile: TestingProfile = {
    framework: null,
    testDir: null,
    hasSystemTests: false,
    hasFactories: false,
    hasMocking: false,
    coverageTool: null,
    estimatedTestCount: 0,
    hasSnapshots: false,
    hasPropertyTests: false,
    hasComponentTests: false,
    hasStorybook: false,
    hasBenchmarks: false,
    testPattern: null,
  };

  // Rails
  if (stack.framework === "rails") {
    if (stack.keyDeps["rspec-rails"] || existsSync(join(rootDir, "spec"))) {
      profile.framework = "rspec";
      profile.testDir = "spec";
    } else if (existsSync(join(rootDir, "test"))) {
      profile.framework = "minitest";
      profile.testDir = "test";
    }
    profile.hasFactories = !!stack.keyDeps["factory_bot_rails"];
    profile.hasMocking = !!stack.keyDeps["webmock"] || !!stack.keyDeps["vcr"];
    profile.hasSystemTests =
      existsSync(join(rootDir, "spec/system")) ||
      existsSync(join(rootDir, "test/system"));
    if (stack.keyDeps["simplecov"]) profile.coverageTool = "simplecov";
  }

  // JS/TS
  if (stack.language === "typescript" || stack.language === "javascript") {
    if (stack.keyDeps["vitest"]) profile.framework = "vitest";
    else if (stack.keyDeps["jest"]) profile.framework = "jest";
    else if (stack.keyDeps["mocha"]) profile.framework = "mocha";

    if (existsSync(join(rootDir, "tests"))) profile.testDir = "tests";
    else if (existsSync(join(rootDir, "test"))) profile.testDir = "test";
    else if (existsSync(join(rootDir, "__tests__"))) profile.testDir = "__tests__";
    else if (existsSync(join(rootDir, "src/__tests__")))
      profile.testDir = "src/__tests__";

    if (stack.keyDeps["@playwright/test"]) profile.hasSystemTests = true;
    if (stack.keyDeps["cypress"]) profile.hasSystemTests = true;
    if (stack.keyDeps["msw"]) profile.hasMocking = true;
    if (stack.keyDeps["c8"] || stack.keyDeps["istanbul"]) profile.coverageTool = "c8";
  }

  // Python
  if (stack.language === "python") {
    if (stack.keyDeps["pytest"]) profile.framework = "pytest";
    else profile.framework = "unittest";
    profile.testDir = existsSync(join(rootDir, "tests")) ? "tests" : "test";
    if (stack.keyDeps["factory_boy"] || stack.keyDeps["factory-boy"]) profile.hasFactories = true;
    if (stack.keyDeps["responses"] || stack.keyDeps["httpretty"] || stack.keyDeps["vcrpy"]) profile.hasMocking = true;
    if (stack.keyDeps["coverage"] || stack.keyDeps["pytest-cov"]) profile.coverageTool = "coverage.py";
    if (stack.keyDeps["selenium"] || stack.keyDeps["playwright"]) profile.hasSystemTests = true;
  }

  // PHP / Laravel
  if (stack.language === "php") {
    profile.framework = "phpunit";
    profile.testDir = existsSync(join(rootDir, "tests")) ? "tests" : "test";
    if (stack.framework === "laravel") {
      profile.hasFactories = existsSync(join(rootDir, "database/factories"));
      if (stack.keyDeps["laravel/dusk"]) profile.hasSystemTests = true;
    }
  }

  // Elixir / Phoenix
  if (stack.language === "elixir") {
    profile.framework = "exunit";
    profile.testDir = "test";
    if (stack.keyDeps["ex_machina"]) profile.hasFactories = true;
    if (stack.keyDeps["mox"]) profile.hasMocking = true;
    if (stack.keyDeps["wallaby"]) profile.hasSystemTests = true;
  }

  // Go
  if (stack.language === "go") {
    profile.framework = "go test";
    profile.testDir = "."; // Go tests are co-located
    if (stack.keyDeps["github.com/stretchr/testify"]) profile.hasMocking = true;
  }

  // Rust
  if (stack.language === "rust") {
    profile.framework = "cargo test";
    profile.testDir = "tests"; // integration tests
    // Rust has built-in mocking via mockall crate
    if (stack.keyDeps["mockall"]) profile.hasMocking = true;
  }

  // Java / Spring
  if (stack.language === "java") {
    profile.framework = "junit";
    profile.testDir = "src/test/java";
    if (stack.keyDeps["mockito"]) profile.hasMocking = true;
  }

  // ─── Cross-cutting: Test file count ──────────────────────────
  if (profile.testDir) {
    const testRoot = join(rootDir, profile.testDir);
    profile.estimatedTestCount = countTestFiles(testRoot);
  }
  // Also count co-located test files in src/ for JS/TS projects
  if ((stack.language === "typescript" || stack.language === "javascript") && existsSync(join(rootDir, "src"))) {
    profile.estimatedTestCount += countTestFiles(join(rootDir, "src"));
  }

  // ─── Cross-cutting: Snapshot testing ───────────────────────
  if (profile.testDir) {
    const testRoot = join(rootDir, profile.testDir);
    if (existsSync(join(testRoot, "__snapshots__"))) {
      profile.hasSnapshots = true;
    } else {
      // Check for .snap files or __snapshots__ dirs recursively (shallow)
      profile.hasSnapshots = hasFilePattern(testRoot, /__snapshots__|\.snap$/, 2);
    }
  }

  // ─── Cross-cutting: Property-based testing ─────────────────
  const propertyTestDeps = ["fast-check", "hypothesis", "proptest", "quickcheck"];
  for (const dep of propertyTestDeps) {
    if (stack.keyDeps[dep]) {
      profile.hasPropertyTests = true;
      break;
    }
  }

  // ─── Cross-cutting: Component testing ──────────────────────
  const componentTestDeps = [
    "@testing-library/react",
    "@testing-library/vue",
    "@testing-library/svelte",
    "@testing-library/angular",
  ];
  for (const dep of componentTestDeps) {
    if (stack.keyDeps[dep]) {
      profile.hasComponentTests = true;
      break;
    }
  }

  // ─── Cross-cutting: Storybook ──────────────────────────────
  if (existsSync(join(rootDir, ".storybook"))) {
    profile.hasStorybook = true;
  } else {
    // Check for @storybook/* in deps
    for (const dep of Object.keys(stack.keyDeps)) {
      if (dep.startsWith("@storybook/")) {
        profile.hasStorybook = true;
        break;
      }
    }
  }

  // ─── Cross-cutting: Benchmarks ─────────────────────────────
  if (
    existsSync(join(rootDir, "bench")) ||
    existsSync(join(rootDir, "benchmarks")) ||
    stack.keyDeps["criterion"] ||
    stack.keyDeps["divan"]
  ) {
    profile.hasBenchmarks = true;
  }

  // ─── Cross-cutting: Test naming pattern detection ──────────
  profile.testPattern = detectTestPattern(rootDir, profile.testDir, stack);

  return profile;
}

// ─── Helper functions ──────────────────────────────────────────

/**
 * Recursively count test files up to maxDepth levels deep.
 */
function countTestFiles(dir: string, depth = 0, maxDepth = 3): number {
  if (depth >= maxDepth || !existsSync(dir)) return 0;
  let count = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (entry.isFile() && /\.(test|spec)\.(ts|tsx|js|jsx|rb|py|ex|exs|go|rs)$/.test(entry.name)) count++;
      if (entry.isFile() && /^test_\w+\.py$/.test(entry.name)) count++;
      if (entry.isFile() && /_test\.go$/.test(entry.name)) count++;
      if (entry.isDirectory()) count += countTestFiles(join(dir, entry.name), depth + 1, maxDepth);
    }
  } catch { /* ignore permission errors */ }
  return count;
}

/**
 * Check if any file/dir matching a pattern exists within depth levels.
 */
function hasFilePattern(dir: string, pattern: RegExp, maxDepth: number, depth = 0): boolean {
  if (depth >= maxDepth || !existsSync(dir)) return false;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (pattern.test(entry.name)) return true;
      if (entry.isDirectory() && hasFilePattern(join(dir, entry.name), pattern, maxDepth, depth + 1)) return true;
    }
  } catch { /* ignore */ }
  return false;
}

/**
 * Detect the dominant test naming pattern from a sample of test files.
 */
function detectTestPattern(
  rootDir: string,
  testDir: string | null,
  stack: StackProfile
): string | null {
  if (!testDir) return null;

  // Language-specific patterns
  if (stack.language === "elixir") return "ExUnit";
  if (stack.language === "go") return "TestXxx";
  if (stack.language === "rust") return "#[test]";
  if (stack.language === "java") return "@Test";

  // For JS/TS/Ruby/Python: sample test files and detect pattern
  const searchDir = join(rootDir, testDir);
  const sampleFiles = findTestFileSamples(searchDir, 3);

  let describeCount = 0;
  let testFnCount = 0;

  for (const filePath of sampleFiles) {
    try {
      const content = readFileSync(filePath, "utf-8");
      if (/\bdescribe\s*\(/.test(content) && /\bit\s*\(/.test(content)) describeCount++;
      if (/\btest\s*\(/.test(content)) testFnCount++;
    } catch { /* ignore */ }
  }

  if (describeCount > 0 && describeCount >= testFnCount) return "describe/it";
  if (testFnCount > 0) return "test()";

  // Ruby-specific
  if (stack.language === "ruby") {
    return stack.keyDeps["rspec-rails"] ? "describe/it" : "def test_";
  }

  // Python-specific
  if (stack.language === "python") return "def test_";

  return null;
}

/**
 * Find up to `limit` test files from a directory for sampling.
 */
function findTestFileSamples(dir: string, limit: number, depth = 0, maxDepth = 3): string[] {
  if (depth >= maxDepth || !existsSync(dir)) return [];
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (results.length >= limit) break;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (entry.isFile() && /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        results.push(join(dir, entry.name));
      }
      if (entry.isDirectory()) {
        results.push(...findTestFileSamples(join(dir, entry.name), limit - results.length, depth + 1, maxDepth));
      }
    }
  } catch { /* ignore */ }
  return results;
}
