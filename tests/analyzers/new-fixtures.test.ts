import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { analyzeCodebase } from "../../src/analyzers/index.js";

const FIXTURES = join(process.cwd(), "tests/fixtures");

describe("New Framework Fixtures", () => {
  describe("FastAPI app", () => {
    it("detects Python/FastAPI stack", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "fastapi-app"),
        skipGit: true,
      });

      expect(profile.stack.language).toBe("python");
      expect(profile.stack.framework).toBe("fastapi");
      expect(profile.stack.languageVersion).toBe("3.12.0");
      expect(profile.stack.runtime).toBe("python");
    });

    it("detects database and testing", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "fastapi-app"),
        skipGit: true,
      });

      // Should detect SQLAlchemy/Alembic
      expect(profile.database.orm).toBeDefined();
      // Should detect pytest
      expect(profile.testing.framework).toBe("pytest");
      // Should detect CI
      expect(profile.cicd.provider).toBe("github-actions");
    });

    it("detects environment variables", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "fastapi-app"),
        skipGit: true,
      });

      expect(profile.environment.envVars.length).toBeGreaterThan(0);
      const dbUrl = profile.environment.envVars.find((e) => e.name === "DATABASE_URL");
      expect(dbUrl).toBeDefined();
    });
  });

  describe("Spring Boot app", () => {
    it("detects Java/Spring stack", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "spring-app"),
        skipGit: true,
      });

      expect(profile.stack.language).toBe("java");
      expect(profile.stack.framework).toBe("spring");
      expect(profile.stack.languageVersion).toBe("21");
      expect(profile.stack.packageManager).toBe("maven");
    });

    it("detects architecture", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "spring-app"),
        skipGit: true,
      });

      expect(profile.architecture.topLevelDirs.length).toBeGreaterThan(0);
    });
  });

  describe("Monorepo app", () => {
    it("detects monorepo structure", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "monorepo-app"),
        skipGit: true,
      });

      expect(profile.stack.monorepo).toBe(true);
      expect(profile.stack.language).toBe("typescript");
    });

    it("detects packages directory", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "monorepo-app"),
        skipGit: true,
      });

      const packagesDir = profile.architecture.topLevelDirs.find(
        (d) => d.path === "packages"
      );
      expect(packagesDir).toBeDefined();
    });
  });

  describe("Minimal app", () => {
    it("handles minimal project gracefully", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "minimal-app"),
        skipGit: true,
      });

      // Should not crash and return basic profile
      expect(profile.stack.language).toBe("unknown");
      expect(profile.stack.framework).toBe("unknown");
      expect(profile.architecture.estimatedSize).toBe("small");
    });
  });
});
