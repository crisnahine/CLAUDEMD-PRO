import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { analyzeCodebase } from "../../src/analyzers/index.js";

const FIXTURES = join(process.cwd(), "tests/fixtures");

describe("Full Analysis Pipeline", () => {
  describe("Rails app", () => {
    it("produces a complete profile for a Rails project", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "rails-app"),
      });

      // Stack
      expect(profile.stack.language).toBe("ruby");
      expect(profile.stack.framework).toBe("rails");
      expect(profile.stack.languageVersion).toBe("3.3.0");
      expect(profile.stack.keyDeps["sidekiq"]).toBeDefined();
      expect(profile.stack.keyDeps["devise"]).toBeDefined();
      expect(profile.stack.keyDeps["pundit"]).toBeDefined();

      // Database
      expect(profile.database.orm).toBe("ActiveRecord");
      expect(profile.database.adapter).toBe("postgresql");
      expect(profile.database.tableCount).toBeGreaterThan(0);
      expect(profile.database.hasMigrations).toBe(true);

      // Testing
      expect(profile.testing.framework).toBe("rspec");
      expect(profile.testing.hasFactories).toBe(true);
      expect(profile.testing.hasMocking).toBe(true);
      expect(profile.testing.hasSystemTests).toBe(true);

      // Commands
      expect(profile.commands.commands.length).toBeGreaterThan(0);
      expect(profile.commands.devServer).toBe("bin/dev");
      expect(profile.commands.hasLinter).toBe(true);

      // Gotchas
      expect(profile.gotchas.gotchas.length).toBeGreaterThan(0);
      const schemaGotcha = profile.gotchas.gotchas.find((g) =>
        g.rule.includes("schema.rb")
      );
      expect(schemaGotcha).toBeDefined();

      // Environment
      expect(profile.environment.envVars.length).toBeGreaterThan(0);
      const dbUrl = profile.environment.envVars.find(
        (e) => e.name === "DATABASE_URL"
      );
      expect(dbUrl).toBeDefined();

      // CI/CD
      expect(profile.cicd.provider).toBe("github-actions");
    });
  });

  describe("Next.js app", () => {
    it("produces a complete profile for a Next.js project", async () => {
      const profile = await analyzeCodebase({
        rootDir: join(FIXTURES, "nextjs-app"),
      });

      // Stack
      expect(profile.stack.language).toBe("typescript");
      expect(profile.stack.framework).toBe("nextjs");
      expect(profile.stack.frameworkVersion).toBe("14.2.0");
      expect(profile.stack.packageManager).toBe("pnpm");

      // Database (Prisma)
      expect(profile.database.orm).toBe("Prisma");
      expect(profile.database.adapter).toBe("postgresql");
      expect(profile.database.tableCount).toBe(3);

      // Testing
      expect(profile.testing.framework).toBe("vitest");
      expect(profile.testing.hasSystemTests).toBe(true); // Playwright

      // Commands
      expect(profile.commands.hasLinter).toBe(true);
      expect(profile.commands.hasFormatter).toBe(true);
      expect(profile.commands.hasTypecheck).toBe(true);
    });
  });
});
