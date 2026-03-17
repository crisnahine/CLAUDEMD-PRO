/**
 * Testing Analyzer - Detects test frameworks, patterns, and coverage setup
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { StackProfile } from "./stack-detector.js";

export interface TestingProfile {
  framework: string | null;
  testDir: string | null;
  hasSystemTests: boolean;
  hasFactories: boolean;
  hasMocking: boolean;
  coverageTool: string | null;
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

  return profile;
}
