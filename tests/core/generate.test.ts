import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  renderClaudeMd,
  getProjectName,
  capitalize,
  getNotableDeps,
} from "../../src/core/generate.js";
import type { CodebaseProfile } from "../../src/analyzers/index.js";
import type { StackProfile } from "../../src/analyzers/stack-detector.js";

const FIXTURES = join(process.cwd(), "tests/fixtures");

/**
 * Build a full mock CodebaseProfile for testing renderClaudeMd.
 */
function createMockProfile(overrides?: Partial<CodebaseProfile>): CodebaseProfile {
  return {
    rootDir: "/tmp/test-project",
    stack: {
      language: "typescript",
      framework: "nextjs",
      languageVersion: "5.5",
      runtimeVersion: "20",
      frameworkVersion: "14.0.0",
      runtime: "node",
      packageManager: "npm",
      monorepo: false,
      keyDeps: { next: "14.0.0", tailwindcss: "3.4.0" },
    },
    architecture: {
      topLevelDirs: [
        { path: "src", purpose: "Source code", fileCount: 50 },
        { path: "tests", purpose: "Test suite", fileCount: 20 },
      ],
      entryPoints: ["src/app/layout.tsx"],
      patterns: ["Server Components by default", "Prisma ORM"],
      estimatedSize: "medium",
      totalFiles: 100,
    },
    commands: {
      commands: [
        { command: "npm run dev", description: "Start dev server", category: "dev" },
        { command: "npm test", description: "Run vitest", category: "test" },
        { command: "npm run lint", description: "ESLint", category: "lint" },
      ],
      devServer: "npm run dev",
      hasLinter: true,
      hasFormatter: true,
      hasTypecheck: true,
    },
    database: {
      adapter: "postgresql",
      orm: "Prisma",
      tableCount: 5,
      hasMigrations: true,
      migrationDir: "prisma/migrations",
      keyModels: ["User", "Post"],
    },
    testing: {
      framework: "vitest",
      testDir: "tests/",
      hasSystemTests: true,
      hasFactories: false,
      hasMocking: true,
      coverageTool: "c8",
    },
    gotchas: {
      generatedDirs: [".next/"],
      generatedFiles: [],
      gotchas: [
        { rule: "DON'T modify .next/", reason: "Auto-generated", severity: "critical" },
        { rule: "DON'T use 'use client' unless needed", reason: "Server components preferred", severity: "warning" },
      ],
    },
    environment: {
      envVars: [
        { name: "DATABASE_URL", hasDefault: false, source: ".env.example" },
        { name: "NEXT_PUBLIC_API_URL", hasDefault: true, source: ".env.example" },
      ],
      hasDocker: false,
      hasDockerCompose: false,
      envFiles: [".env.example"],
      secretManager: null,
      hasTypedEnv: false,
      varGroups: {},
    },
    cicd: {
      provider: "github-actions",
      workflowFiles: ["ci.yml"],
      hasDeployStep: false,
      deployTarget: null,
      hasDocker: false,
      hasDockerCompose: false,
      triggers: [],
      jobs: [],
    },
    gitHistory: {
      isGitRepo: false,
      insights: [],
      topChangedFiles: [],
      recentContributors: 0,
    },
    fileScan: {
      totalFiles: 100,
      categories: {},
      uncategorized: [],
      truncated: false,
    },
    domains: {
      domains: [
        {
          name: "Authentication",
          description: "User auth",
          keyFiles: ["src/auth/login.ts"],
          entities: ["User"],
          endpoints: ["/api/auth/login"],
        },
      ],
      keyFeatures: ["User authentication"],
      entityCount: 1,
    },
    style: {
      conventions: [
        { category: "Naming", pattern: "camelCase for files" },
        { category: "Imports", pattern: "named imports preferred" },
      ],
      namingStyle: "camelCase",
      importStyle: "named imports",
      exportStyle: "named exports",
    },
    analyzedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Core Generate Module", () => {
  // ─── renderClaudeMd ─────────────────────────────────────────
  describe("renderClaudeMd", () => {
    it("produces valid markdown from a complete profile", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile);

      expect(md).toBeDefined();
      expect(typeof md).toBe("string");
      expect(md.length).toBeGreaterThan(0);
      // Should start with a heading
      expect(md).toMatch(/^# /);
    });

    it("includes all major sections when data exists", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile);

      expect(md).toContain("## Critical Context");
      expect(md).toContain("## Commands");
      expect(md).toContain("## Architecture");
      expect(md).toContain("## Key Patterns");
      expect(md).toContain("## What This App Does");
      expect(md).toContain("## Coding Conventions");
      expect(md).toContain("## Gotchas");
      expect(md).toContain("## Environment");
      expect(md).toContain("## CI/CD");
    });

    it("includes critical context details", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile);

      expect(md).toContain("Typescript 5.5");
      expect(md).toContain("Node.js 20");
      expect(md).toContain("Framework: Nextjs 14.0.0");
      expect(md).toContain("Database: Postgresql with Prisma");
      expect(md).toContain("Testing: vitest");
      expect(md).toContain("Tailwind CSS");
    });

    it("includes command entries in code block", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile);

      expect(md).toContain("npm run dev");
      expect(md).toContain("npm test");
      expect(md).toContain("npm run lint");
    });

    it("includes architecture directory listing", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile);

      expect(md).toContain("/src/");
      expect(md).toContain("Source code");
      expect(md).toContain("/tests/");
    });

    it("includes key patterns", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile);

      expect(md).toContain("Server Components by default");
      expect(md).toContain("Prisma ORM");
    });

    it("includes domain information", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile);

      expect(md).toContain("Authentication");
      expect(md).toContain("User");
      expect(md).toContain("/api/auth/login");
    });

    it("includes coding conventions", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile);

      expect(md).toContain("Naming");
      expect(md).toContain("camelCase for files");
    });

    it("includes gotchas", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile);

      expect(md).toContain("DON'T modify .next/");
      expect(md).toContain("Auto-generated");
    });

    it("includes required environment variables (no defaults only)", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile);

      expect(md).toContain("`DATABASE_URL`");
      expect(md).toContain("required, no default");
      // NEXT_PUBLIC_API_URL has a default, so it should NOT appear
      expect(md).not.toContain("`NEXT_PUBLIC_API_URL`");
    });

    it("includes CI/CD section", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile);

      expect(md).toContain("Provider: github-actions");
      expect(md).toContain("ci.yml");
    });

    it("skips empty sections gracefully", () => {
      const profile = createMockProfile({
        commands: { commands: [], devServer: undefined, hasLinter: false, hasFormatter: false, hasTypecheck: false },
        database: { adapter: "", orm: "", tableCount: 0, hasMigrations: false, migrationDir: "", keyModels: [], hasRedis: false, hasNoSQL: false, migrationCount: 0, schemaFile: null },
        gotchas: { generatedDirs: [], generatedFiles: [], gotchas: [] },
        environment: { envVars: [], hasDocker: false, hasDockerCompose: false, envFiles: [], secretManager: null, hasTypedEnv: false, varGroups: {} },
        cicd: { provider: "", workflowFiles: [], hasDeployStep: false, deployTarget: null, hasDocker: false, hasDockerCompose: false, triggers: [], jobs: [] },
        domains: { domains: [], keyFeatures: [], entityCount: 0 },
        style: { conventions: [], namingStyle: "", importStyle: "", exportStyle: "" },
      });
      const md = renderClaudeMd(profile);

      // These sections should be absent when data is empty
      expect(md).not.toContain("## Commands");
      expect(md).not.toContain("## Gotchas");
      expect(md).not.toContain("## Environment");
      expect(md).not.toContain("## CI/CD");
      expect(md).not.toContain("## What This App Does");
      expect(md).not.toContain("## Coding Conventions");
      // These should still exist
      expect(md).toContain("## Critical Context");
      expect(md).toContain("## Architecture");
    });

    it("skips database line from critical context when no adapter", () => {
      const profile = createMockProfile({
        database: { adapter: "", orm: "", tableCount: 0, hasMigrations: false, migrationDir: "", keyModels: [], hasRedis: false, hasNoSQL: false, migrationCount: 0, schemaFile: null },
      });
      const md = renderClaudeMd(profile);

      expect(md).not.toContain("Database:");
    });

    it("skips testing line from critical context when no framework", () => {
      const profile = createMockProfile({
        testing: { framework: "", testDir: "", hasSystemTests: false, hasFactories: false, hasMocking: false, coverageTool: "", estimatedTestCount: 0, hasSnapshots: false, hasPropertyTests: false, hasComponentTests: false, hasStorybook: false, hasBenchmarks: false, testPattern: null },
      });
      const md = renderClaudeMd(profile);

      expect(md).not.toContain("Testing:");
    });

    it("generates @import hints for large modular projects", () => {
      const largeDirs = Array.from({ length: 12 }, (_, i) => ({
        path: `module-${i}`,
        purpose: `Module ${i}`,
        fileCount: 30,
      }));
      const profile = createMockProfile({
        architecture: {
          topLevelDirs: largeDirs,
          entryPoints: [],
          patterns: [],
          estimatedSize: "large",
          totalFiles: 500,
        },
      });
      const md = renderClaudeMd(profile, { modular: true });

      expect(md).toContain("## Module Context");
      expect(md).toContain("@import");
      expect(md).toContain("CLAUDE.md");
    });

    it("does not generate @import hints for small projects", () => {
      const profile = createMockProfile();
      const md = renderClaudeMd(profile, { modular: true });

      expect(md).not.toContain("## Module Context");
      expect(md).not.toContain("@import");
    });

    it("does not generate @import when modular option is false", () => {
      const largeDirs = Array.from({ length: 12 }, (_, i) => ({
        path: `module-${i}`,
        purpose: `Module ${i}`,
        fileCount: 30,
      }));
      const profile = createMockProfile({
        architecture: {
          topLevelDirs: largeDirs,
          entryPoints: [],
          patterns: [],
          estimatedSize: "large",
          totalFiles: 500,
        },
      });
      const md = renderClaudeMd(profile);

      expect(md).not.toContain("## Module Context");
    });
  });

  // ─── getProjectName ─────────────────────────────────────────
  describe("getProjectName", () => {
    it("reads name from package.json when available", () => {
      const name = getProjectName(join(FIXTURES, "nextjs-app"));
      // The nextjs-app fixture should have a name in package.json
      expect(name).toBeDefined();
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    });

    it("falls back to directory name when no package.json", () => {
      const name = getProjectName(join(FIXTURES, "phoenix-app"));
      // Phoenix app has no package.json, should fall back to dir name
      expect(name).toBe("phoenix-app");
    });

    it("falls back to directory name for non-existent path", () => {
      const name = getProjectName("/tmp/some-nonexistent-project");
      expect(name).toBe("some-nonexistent-project");
    });
  });

  // ─── capitalize ─────────────────────────────────────────────
  describe("capitalize", () => {
    it("capitalizes the first letter", () => {
      expect(capitalize("hello")).toBe("Hello");
    });

    it("handles already capitalized strings", () => {
      expect(capitalize("Hello")).toBe("Hello");
    });

    it("handles single character", () => {
      expect(capitalize("a")).toBe("A");
    });

    it("handles empty string", () => {
      expect(capitalize("")).toBe("");
    });

    it("preserves rest of the string", () => {
      expect(capitalize("helloWorld")).toBe("HelloWorld");
    });
  });

  // ─── getNotableDeps ─────────────────────────────────────────
  describe("getNotableDeps", () => {
    it("detects Rails notable deps", () => {
      const stack: StackProfile = {
        language: "ruby",
        framework: "rails",
        languageVersion: "3.3.0",
        runtimeVersion: "3.3.0",
        frameworkVersion: "7.1.0",
        runtime: "ruby",
        packageManager: "bundler",
        monorepo: false,
        keyDeps: { devise: "4.9.0", pundit: "2.3.0", sidekiq: "7.2.0" },
      };
      const deps = getNotableDeps(stack);

      expect(deps).toContain("Devise (auth)");
      expect(deps).toContain("Pundit (authorization)");
      expect(deps).toContain("Sidekiq (jobs)");
    });

    it("detects TypeScript notable deps", () => {
      const stack: StackProfile = {
        language: "typescript",
        framework: "nextjs",
        languageVersion: "5.5",
        runtimeVersion: "20",
        frameworkVersion: "14.0.0",
        runtime: "node",
        packageManager: "npm",
        monorepo: false,
        keyDeps: { tailwindcss: "3.4.0", zod: "3.22.0", zustand: "4.5.0" },
      };
      const deps = getNotableDeps(stack);

      expect(deps).toContain("Tailwind CSS");
      expect(deps).toContain("Zod (validation)");
      expect(deps).toContain("Zustand");
    });

    it("detects Python notable deps", () => {
      const stack: StackProfile = {
        language: "python",
        framework: "fastapi",
        languageVersion: "3.12",
        runtimeVersion: "3.12",
        frameworkVersion: "",
        runtime: "python",
        packageManager: "pip",
        monorepo: false,
        keyDeps: { celery: "5.3.0", sqlalchemy: "2.0.0", pydantic: "2.5.0" },
      };
      const deps = getNotableDeps(stack);

      expect(deps).toContain("Celery (tasks)");
      expect(deps).toContain("SQLAlchemy");
      expect(deps).toContain("Pydantic");
    });

    it("detects Go notable deps", () => {
      const stack: StackProfile = {
        language: "go",
        framework: "gin",
        languageVersion: "1.21",
        runtimeVersion: "1.21",
        frameworkVersion: "",
        runtime: "go",
        packageManager: "go",
        monorepo: false,
        keyDeps: { "gorm.io/gorm": "1.25.0", "go.uber.org/zap": "1.26.0" },
      };
      const deps = getNotableDeps(stack);

      expect(deps).toContain("GORM");
      expect(deps).toContain("Zap (logging)");
    });

    it("detects Rust notable deps", () => {
      const stack: StackProfile = {
        language: "rust",
        framework: "actix",
        languageVersion: "1.75",
        runtimeVersion: "1.75",
        frameworkVersion: "",
        runtime: "rust",
        packageManager: "cargo",
        monorepo: false,
        keyDeps: { diesel: "2.0.0", tokio: "1.35.0", serde: "1.0.0", tracing: "0.1.0" },
      };
      const deps = getNotableDeps(stack);

      expect(deps).toContain("Diesel (ORM)");
      expect(deps).toContain("Tokio (async runtime)");
      expect(deps).toContain("Serde (serialization)");
      expect(deps).toContain("Tracing (observability)");
    });

    it("detects Elixir notable deps", () => {
      const stack: StackProfile = {
        language: "elixir",
        framework: "phoenix",
        languageVersion: "1.16",
        runtimeVersion: "1.16",
        frameworkVersion: "1.7.10",
        runtime: "beam",
        packageManager: "hex",
        monorepo: false,
        keyDeps: { oban: "2.17.0", phoenix_live_view: "0.20.1", swoosh: "1.5.0" },
      };
      const deps = getNotableDeps(stack);

      expect(deps).toContain("Oban (job processing)");
      expect(deps).toContain("LiveView");
      expect(deps).toContain("Swoosh (email)");
    });

    it("returns empty array for unknown language with no matching deps", () => {
      const stack: StackProfile = {
        language: "unknown",
        framework: "unknown",
        languageVersion: "",
        runtimeVersion: null,
        frameworkVersion: "",
        runtime: "",
        packageManager: "",
        monorepo: false,
        keyDeps: {},
      };
      const deps = getNotableDeps(stack);

      expect(deps).toEqual([]);
    });

    it("caps at 8 notable deps", () => {
      const stack: StackProfile = {
        language: "ruby",
        framework: "rails",
        languageVersion: "3.3.0",
        runtimeVersion: "3.3.0",
        frameworkVersion: "7.1.0",
        runtime: "ruby",
        packageManager: "bundler",
        monorepo: false,
        keyDeps: {
          devise: "4.9.0",
          pundit: "2.3.0",
          sidekiq: "7.2.0",
          "turbo-rails": "1.5.0",
          "stimulus-rails": "1.3.0",
          view_component: "3.10.0",
          pagy: "6.4.0",
          ransack: "4.1.0",
          pg_search: "2.3.0",
          stripe: "10.0.0",
        },
      };
      const deps = getNotableDeps(stack);

      expect(deps.length).toBeLessThanOrEqual(8);
    });
  });
});
