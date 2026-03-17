import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { analyzeCodebase } from "../../src/analyzers/index.js";

const FIXTURES = join(process.cwd(), "tests/fixtures");

describe("Framework-Specific Analysis", () => {
  describe("Django app", () => {
    it("produces a complete profile for a Django project", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "django-app"),
        skipGit: true,
      });

      // Stack
      expect(profile.stack.language).toBe("python");
      expect(profile.stack.framework).toBe("django");
      expect(profile.stack.languageVersion).toBe("3.12.0");
      expect(profile.stack.runtime).toBe("python");

      // Database
      expect(profile.database.orm).toBe("Django ORM");
      expect(profile.database.adapter).toBe("postgresql");

      // Testing
      expect(profile.testing.framework).toBe("pytest");
      expect(profile.testing.hasFactories).toBe(true);

      // Commands
      expect(profile.commands.commands.length).toBeGreaterThan(0);
      const testCmd = profile.commands.commands.find(
        (c) => c.command.includes("pytest") || c.command.includes("test")
      );
      expect(testCmd).toBeDefined();
      expect(profile.commands.hasLinter).toBe(true);
      expect(profile.commands.hasTypecheck).toBe(true);

      // Gotchas
      expect(profile.gotchas.gotchas.length).toBeGreaterThan(0);
      const migrationGotcha = profile.gotchas.gotchas.find((g) =>
        g.rule.includes("migration")
      );
      expect(migrationGotcha).toBeDefined();

      // Environment
      expect(profile.environment.envVars.length).toBeGreaterThan(0);

      // CI/CD
      expect(profile.cicd.provider).toBe("github-actions");
    });
  });

  describe("Go app", () => {
    it("produces a complete profile for a Go/Gin project", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "go-app"),
        skipGit: true,
      });

      // Stack
      expect(profile.stack.language).toBe("go");
      expect(profile.stack.framework).toBe("gin");
      expect(profile.stack.languageVersion).toBe("1.22");
      expect(profile.stack.packageManager).toBe("go modules");

      // Architecture
      expect(profile.architecture.topLevelDirs.length).toBeGreaterThan(0);
      const cmdDir = profile.architecture.topLevelDirs.find(
        (d) => d.path === "cmd"
      );
      expect(cmdDir).toBeDefined();

      // Commands
      const goTestCmd = profile.commands.commands.find(
        (c) => c.command.includes("go test")
      );
      expect(goTestCmd).toBeDefined();
      expect(profile.commands.hasLinter).toBe(true);

      // Gotchas
      const errorGotcha = profile.gotchas.gotchas.find((g) =>
        g.rule.includes("error")
      );
      expect(errorGotcha).toBeDefined();

      // Patterns
      expect(profile.architecture.patterns).toContain("cmd/ entry point pattern");
      expect(profile.architecture.patterns).toContain("internal/ package encapsulation");
    });
  });

  describe("Laravel app", () => {
    it("produces a complete profile for a Laravel project", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "laravel-app"),
        skipGit: true,
      });

      // Stack
      expect(profile.stack.language).toBe("php");
      expect(profile.stack.framework).toBe("laravel");
      expect(profile.stack.packageManager).toBe("composer");

      // Database
      expect(profile.database.orm).toBe("Eloquent");
      expect(profile.database.adapter).toBe("postgresql");
      expect(profile.database.hasMigrations).toBe(true);
      expect(profile.database.keyModels.length).toBeGreaterThan(0);

      // Commands
      const artisanCmd = profile.commands.commands.find(
        (c) => c.command.includes("artisan")
      );
      expect(artisanCmd).toBeDefined();

      // Gotchas
      expect(profile.gotchas.gotchas.length).toBeGreaterThan(0);
      const envGotcha = profile.gotchas.gotchas.find((g) =>
        g.rule.includes("env()")
      );
      expect(envGotcha).toBeDefined();
    });
  });
});
