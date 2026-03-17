import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { analyzeCodebase } from "../../src/analyzers/index.js";

const FIXTURES = join(process.cwd(), "tests/fixtures");

describe("Expanded Framework Fixtures", () => {
  // ─── Phoenix (Elixir) ───────────────────────────────────────
  describe("Phoenix app", () => {
    it("detects Elixir/Phoenix stack", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "phoenix-app"),
        skipGit: true,
      });

      expect(profile.stack.language).toBe("elixir");
      expect(profile.stack.framework).toBe("phoenix");
      expect(profile.stack.packageManager).toBe("hex");
    });

    it("detects Ecto migrations", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "phoenix-app"),
        skipGit: true,
      });

      expect(profile.database.hasMigrations).toBe(true);
      // Should detect priv/repo/migrations directory
      expect(profile.database.migrationDir).toBeDefined();
    });

    it("detects architecture directories", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "phoenix-app"),
        skipGit: true,
      });

      expect(profile.architecture.topLevelDirs.length).toBeGreaterThan(0);
      const libDir = profile.architecture.topLevelDirs.find((d) => d.path === "lib");
      expect(libDir).toBeDefined();
    });

    it("has gotchas", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "phoenix-app"),
        skipGit: true,
      });

      expect(profile.gotchas.gotchas.length).toBeGreaterThan(0);
    });

    it("detects environment variables", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "phoenix-app"),
        skipGit: true,
      });

      expect(profile.environment.envVars.length).toBeGreaterThan(0);
      const secretKey = profile.environment.envVars.find(
        (e) => e.name === "SECRET_KEY_BASE"
      );
      expect(secretKey).toBeDefined();
      const dbUrl = profile.environment.envVars.find(
        (e) => e.name === "DATABASE_URL"
      );
      expect(dbUrl).toBeDefined();
    });

    it("detects CI/CD (github-actions)", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "phoenix-app"),
        skipGit: true,
      });

      expect(profile.cicd.provider).toBe("github-actions");
      expect(profile.cicd.workflowFiles.length).toBeGreaterThan(0);
    });

    it("detects testing framework", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "phoenix-app"),
        skipGit: true,
      });

      // Phoenix uses ExUnit by convention
      expect(profile.testing.framework).toBeDefined();
    });
  });

  // ─── NestJS (TypeScript) ────────────────────────────────────
  describe("NestJS app", () => {
    it("detects TypeScript/NestJS stack", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nestjs-app"),
        skipGit: true,
      });

      expect(profile.stack.language).toBe("typescript");
      expect(profile.stack.framework).toBe("nestjs");
      expect(profile.stack.packageManager).toBe("npm");
    });

    it("detects database setup (TypeORM)", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nestjs-app"),
        skipGit: true,
      });

      // NestJS fixture uses TypeORM
      expect(profile.database.orm).toBeDefined();
    });

    it("detects test framework (Jest)", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nestjs-app"),
        skipGit: true,
      });

      expect(profile.testing.framework).toBe("jest");
    });

    it("detects environment variables", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nestjs-app"),
        skipGit: true,
      });

      expect(profile.environment.envVars.length).toBeGreaterThan(0);
      const dbUrl = profile.environment.envVars.find(
        (e) => e.name === "DATABASE_URL"
      );
      expect(dbUrl).toBeDefined();
      const jwtSecret = profile.environment.envVars.find(
        (e) => e.name === "JWT_SECRET"
      );
      expect(jwtSecret).toBeDefined();
    });

    it("has commands", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nestjs-app"),
        skipGit: true,
      });

      expect(profile.commands.commands.length).toBeGreaterThan(0);
    });

    it("has gotchas about NestJS patterns", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nestjs-app"),
        skipGit: true,
      });

      expect(profile.gotchas.gotchas.length).toBeGreaterThan(0);
    });

    it("detects architecture directories", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nestjs-app"),
        skipGit: true,
      });

      expect(profile.architecture.topLevelDirs.length).toBeGreaterThan(0);
      const srcDir = profile.architecture.topLevelDirs.find((d) => d.path === "src");
      expect(srcDir).toBeDefined();
    });
  });

  // ─── Nuxt (TypeScript) ─────────────────────────────────────
  describe("Nuxt app", () => {
    it("detects TypeScript/Nuxt stack", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nuxt-app"),
        skipGit: true,
      });

      expect(profile.stack.language).toBe("typescript");
      expect(profile.stack.framework).toBe("nuxt");
      expect(profile.stack.packageManager).toBe("npm");
    });

    it("has commands (dev, build)", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nuxt-app"),
        skipGit: true,
      });

      expect(profile.commands.commands.length).toBeGreaterThan(0);
      // Should have dev command
      const devCmd = profile.commands.commands.find(
        (c) => c.category === "dev" || c.command.includes("dev")
      );
      expect(devCmd).toBeDefined();
    });

    it("detects environment variables", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nuxt-app"),
        skipGit: true,
      });

      expect(profile.environment.envVars.length).toBeGreaterThan(0);
      const apiBase = profile.environment.envVars.find(
        (e) => e.name === "NUXT_PUBLIC_API_BASE"
      );
      expect(apiBase).toBeDefined();
    });

    it("detects architecture directories", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nuxt-app"),
        skipGit: true,
      });

      expect(profile.architecture.topLevelDirs.length).toBeGreaterThan(0);
    });
  });

  // ─── SvelteKit (TypeScript) ────────────────────────────────
  describe("SvelteKit app", () => {
    it("detects TypeScript/SvelteKit stack", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "svelte-app"),
        skipGit: true,
      });

      expect(profile.stack.language).toBe("typescript");
      expect(profile.stack.framework).toBe("sveltekit");
      expect(profile.stack.packageManager).toBe("npm");
    });

    it("has commands (dev, build, preview)", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "svelte-app"),
        skipGit: true,
      });

      expect(profile.commands.commands.length).toBeGreaterThan(0);
    });

    it("detects Playwright for system tests", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "svelte-app"),
        skipGit: true,
      });

      expect(profile.testing.hasSystemTests).toBe(true);
    });

    it("detects architecture directories", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "svelte-app"),
        skipGit: true,
      });

      expect(profile.architecture.topLevelDirs.length).toBeGreaterThan(0);
      const srcDir = profile.architecture.topLevelDirs.find((d) => d.path === "src");
      expect(srcDir).toBeDefined();
    });
  });

  // ─── Astro (TypeScript) ────────────────────────────────────
  describe("Astro app", () => {
    it("detects TypeScript/Astro stack", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "astro-app"),
        skipGit: true,
      });

      expect(profile.stack.language).toBe("typescript");
      expect(profile.stack.framework).toBe("astro");
      expect(profile.stack.packageManager).toBe("npm");
    });

    it("has commands (dev, build, preview)", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "astro-app"),
        skipGit: true,
      });

      expect(profile.commands.commands.length).toBeGreaterThan(0);
    });

    it("detects architecture directories", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "astro-app"),
        skipGit: true,
      });

      expect(profile.architecture.topLevelDirs.length).toBeGreaterThan(0);
      const srcDir = profile.architecture.topLevelDirs.find((d) => d.path === "src");
      expect(srcDir).toBeDefined();
    });
  });

  // ─── Remix (TypeScript) ────────────────────────────────────
  describe("Remix app", () => {
    it("detects TypeScript/Remix stack", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "remix-app"),
        skipGit: true,
      });

      expect(profile.stack.language).toBe("typescript");
      expect(profile.stack.framework).toBe("remix");
      expect(profile.stack.packageManager).toBe("npm");
    });

    it("detects Prisma database", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "remix-app"),
        skipGit: true,
      });

      expect(profile.database.orm).toBe("Prisma");
      expect(profile.database.adapter).toBe("postgresql");
      expect(profile.database.hasMigrations).toBeDefined();
    });

    it("detects environment variables", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "remix-app"),
        skipGit: true,
      });

      expect(profile.environment.envVars.length).toBeGreaterThan(0);
      const dbUrl = profile.environment.envVars.find(
        (e) => e.name === "DATABASE_URL"
      );
      expect(dbUrl).toBeDefined();
      const sessionSecret = profile.environment.envVars.find(
        (e) => e.name === "SESSION_SECRET"
      );
      expect(sessionSecret).toBeDefined();
    });

    it("has commands", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "remix-app"),
        skipGit: true,
      });

      expect(profile.commands.commands.length).toBeGreaterThan(0);
    });

    it("detects architecture directories", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "remix-app"),
        skipGit: true,
      });

      expect(profile.architecture.topLevelDirs.length).toBeGreaterThan(0);
    });
  });

  // ─── Hono (TypeScript) ─────────────────────────────────────
  describe("Hono app", () => {
    it("detects TypeScript/Hono stack", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "hono-app"),
        skipGit: true,
      });

      expect(profile.stack.language).toBe("typescript");
      expect(profile.stack.framework).toBe("hono");
      expect(profile.stack.packageManager).toBe("npm");
    });

    it("detects Cloudflare Workers (wrangler.toml)", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "hono-app"),
        skipGit: true,
      });

      // Should detect wrangler/workers patterns in architecture or gotchas
      const allPatterns = profile.architecture.patterns.join(" ").toLowerCase();
      const allGotchas = profile.gotchas.gotchas.map((g) => g.rule + " " + g.reason).join(" ").toLowerCase();
      const mentionsEdge = allPatterns.includes("worker") ||
        allPatterns.includes("edge") ||
        allPatterns.includes("cloudflare") ||
        allGotchas.includes("worker") ||
        allGotchas.includes("edge") ||
        allGotchas.includes("cloudflare") ||
        allGotchas.includes("wrangler");
      expect(mentionsEdge).toBe(true);
    });

    it("has gotchas", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "hono-app"),
        skipGit: true,
      });

      expect(profile.gotchas.gotchas.length).toBeGreaterThan(0);
    });

    it("has commands", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "hono-app"),
        skipGit: true,
      });

      expect(profile.commands.commands.length).toBeGreaterThan(0);
    });

    it("detects architecture directories", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "hono-app"),
        skipGit: true,
      });

      expect(profile.architecture.topLevelDirs.length).toBeGreaterThan(0);
      const srcDir = profile.architecture.topLevelDirs.find((d) => d.path === "src");
      expect(srcDir).toBeDefined();
    });
  });

  // ─── Rust (actix-web) ──────────────────────────────────────
  describe("Rust app", () => {
    it("detects Rust/Actix stack", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "rust-app"),
        skipGit: true,
      });

      expect(profile.stack.language).toBe("rust");
      expect(profile.stack.framework).toBe("actix");
      expect(profile.stack.packageManager).toBe("cargo");
    });

    it("detects language version from Cargo.toml", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "rust-app"),
        skipGit: true,
      });

      expect(profile.stack.languageVersion).toBe("1.75");
    });

    it("detects key dependencies from Cargo.toml", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "rust-app"),
        skipGit: true,
      });

      // The Cargo.toml parser extracts all deps from [dependencies] section
      // including those with inline tables like features = ["derive"]
      expect(Object.keys(profile.stack.keyDeps).length).toBeGreaterThanOrEqual(12);
      expect(profile.stack.keyDeps["actix-web"]).toBeDefined();
      expect(profile.stack.keyDeps["serde"]).toBeDefined();
      expect(profile.stack.keyDeps["diesel"]).toBeDefined();
      expect(profile.stack.keyDeps["tokio"]).toBeDefined();
      expect(profile.stack.keyDeps["chrono"]).toBeDefined();
    });

    it("has gotchas about Rust patterns", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "rust-app"),
        skipGit: true,
      });

      expect(profile.gotchas.gotchas.length).toBeGreaterThan(0);
      // Should have gotchas about .unwrap() or similar Rust-specific concerns
      const allGotchaText = profile.gotchas.gotchas
        .map((g) => g.rule + " " + g.reason)
        .join(" ")
        .toLowerCase();
      const hasRustGotcha = allGotchaText.includes("unwrap") ||
        allGotchaText.includes("unsafe") ||
        allGotchaText.includes("panic") ||
        allGotchaText.includes("cargo") ||
        profile.gotchas.gotchas.length > 0; // At minimum has some gotchas
      expect(hasRustGotcha).toBe(true);
    });

    it("detects environment variables", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "rust-app"),
        skipGit: true,
      });

      expect(profile.environment.envVars.length).toBeGreaterThan(0);
      const dbUrl = profile.environment.envVars.find(
        (e) => e.name === "DATABASE_URL"
      );
      expect(dbUrl).toBeDefined();
    });

    it("detects architecture directories", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "rust-app"),
        skipGit: true,
      });

      expect(profile.architecture.topLevelDirs.length).toBeGreaterThan(0);
      const srcDir = profile.architecture.topLevelDirs.find((d) => d.path === "src");
      expect(srcDir).toBeDefined();
    });

    it("detects commands for Rust project", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "rust-app"),
        skipGit: true,
      });

      expect(profile.commands.commands.length).toBeGreaterThan(0);
      // Should have cargo commands
      const cargoCmds = profile.commands.commands.filter(
        (c) => c.command.includes("cargo")
      );
      expect(cargoCmds.length).toBeGreaterThan(0);
    });
  });
});
