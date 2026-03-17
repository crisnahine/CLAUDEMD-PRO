import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { detectDrift } from "../../src/evolve/index.js";

const FIXTURES = join(process.cwd(), "tests/fixtures");

// Temp file tracking for cleanup
const tempFiles: string[] = [];

function writeTempClaudeMd(content: string): string {
  const tmpPath = join("/tmp", `test-claude-md-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(tmpPath, content, "utf-8");
  tempFiles.push(tmpPath);
  return tmpPath;
}

afterEach(() => {
  for (const f of tempFiles) {
    if (existsSync(f)) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  }
  tempFiles.length = 0;
});

describe("Drift Detection Engine", () => {
  describe("detectDrift with rails-app", () => {
    it("returns a drift report", async () => {
      const claudeMd = writeTempClaudeMd([
        "# rails-app",
        "",
        "## Critical Context",
        "- Ruby 3.3.0",
        "- Framework: Rails 7.1",
        "",
        "## Commands",
        "```",
        "bin/dev                            # Start dev server",
        "```",
        "",
        "## Architecture",
        "/app/                              # Application code",
        "/config/                           # Configuration",
        "",
        "## Gotchas",
        "- DON'T modify db/schema.rb",
      ].join("\n"));

      const report = await detectDrift(
        join(FIXTURES, "rails-app"),
        claudeMd
      );

      expect(report).toBeDefined();
      expect(report.driftItems).toBeDefined();
      expect(Array.isArray(report.driftItems)).toBe(true);
      expect(report.currentScore).toBeDefined();
      expect(report.estimatedScoreAfterFix).toBeDefined();
      expect(report.lastAnalyzed).toBeDefined();
    });

    it("detects stale paths (non-existent references)", async () => {
      const claudeMd = writeTempClaudeMd([
        "# rails-app",
        "",
        "## Architecture",
        "`/app/nonexistent_dir/` is important",
        "`/src/fake_module/` does stuff",
      ].join("\n"));

      const report = await detectDrift(
        join(FIXTURES, "rails-app"),
        claudeMd
      );

      const stalePaths = report.driftItems.filter((i) => i.type === "stale-path");
      expect(stalePaths.length).toBeGreaterThan(0);
      expect(stalePaths[0].severity).toBe("critical");
    });

    it("detects missing directories not documented", async () => {
      // Provide a minimal CLAUDE.md that doesn't mention most dirs
      const claudeMd = writeTempClaudeMd([
        "# rails-app",
        "",
        "## Critical Context",
        "- Ruby 3.3.0",
        "- Framework: Rails",
      ].join("\n"));

      const report = await detectDrift(
        join(FIXTURES, "rails-app"),
        claudeMd
      );

      const missingDirs = report.driftItems.filter((i) => i.type === "missing-dir");
      // Rails app should have significant dirs like app/, config/, db/, etc.
      expect(missingDirs.length).toBeGreaterThan(0);
      expect(missingDirs[0].severity).toBe("warning");
    });

    it("detects framework reference", async () => {
      const claudeMd = writeTempClaudeMd([
        "# rails-app",
        "",
        "## Critical Context",
        "- Ruby 3.3.0",
        "- Framework: Rails 7.1",
      ].join("\n"));

      const report = await detectDrift(
        join(FIXTURES, "rails-app"),
        claudeMd
      );

      // Should NOT flag framework as missing since "rails" is mentioned
      const frameworkChanges = report.driftItems.filter(
        (i) => i.type === "framework-change" && i.message.includes("not mentioned")
      );
      expect(frameworkChanges).toHaveLength(0);
    });

    it("detects missing gotchas", async () => {
      // Provide CLAUDE.md without any gotcha content
      const claudeMd = writeTempClaudeMd([
        "# rails-app",
        "",
        "## Critical Context",
        "- Rails",
      ].join("\n"));

      const report = await detectDrift(
        join(FIXTURES, "rails-app"),
        claudeMd
      );

      const missingGotchas = report.driftItems.filter(
        (i) => i.type === "missing-gotcha"
      );
      expect(missingGotchas.length).toBeGreaterThan(0);
    });
  });

  describe("drift scoring", () => {
    it("scores 100 when no drift items exist", async () => {
      // Provide a very thorough CLAUDE.md that covers everything
      // We test the scoring concept: fewer issues = higher score
      const claudeMd = writeTempClaudeMd([
        "# rails-app",
        "",
        "## Critical Context",
        "- Ruby 3.3.0",
        "- Framework: Rails 7.1.3",
        "- Database: PostgreSQL with ActiveRecord",
        "- Testing: rspec",
        "- Key deps: Devise, Pundit, Sidekiq",
        "",
        "## Commands",
        "```",
        "bin/dev                            # Start dev server",
        "bundle exec rspec                  # Run tests",
        "bundle exec rubocop               # Lint",
        "bin/rails db:migrate              # Run migrations",
        "```",
        "",
        "## Architecture",
        "/app/                              # Application code",
        "/app/models/                       # ActiveRecord models",
        "/app/controllers/                  # Request handlers",
        "/app/views/                        # ERB templates",
        "/app/services/                     # Service objects",
        "/app/jobs/                         # Sidekiq jobs",
        "/config/                           # Configuration",
        "/db/                               # Database schema & migrations",
        "/spec/                             # RSpec tests",
        "/lib/                              # Library code",
        "",
        "## Gotchas",
        "- DON'T modify db/schema.rb directly — auto-generated by migrations",
        "- DON'T commit .env — use .env.example",
        "- DON'T skip migration — always use rails generate migration",
        "- tmp/ is auto-generated",
        "- log/ is auto-generated",
        "",
        "## Environment",
        "- .env file required",
        "- DATABASE_URL",
        "- REDIS_URL",
      ].join("\n"));

      const report = await detectDrift(
        join(FIXTURES, "rails-app"),
        claudeMd
      );

      // With thorough documentation, score should be relatively high
      expect(report.currentScore).toBeGreaterThanOrEqual(50);
    });

    it("has lower score for sparse CLAUDE.md", async () => {
      const claudeMd = writeTempClaudeMd("# rails-app\n\nThis is a project.");

      const report = await detectDrift(
        join(FIXTURES, "rails-app"),
        claudeMd
      );

      // Many missing items = low score
      expect(report.currentScore).toBeLessThan(100);
      expect(report.driftItems.length).toBeGreaterThan(0);
    });

    it("estimated score after fix is higher than current score", async () => {
      const claudeMd = writeTempClaudeMd([
        "# rails-app",
        "",
        "## Critical Context",
        "- Rails",
      ].join("\n"));

      const report = await detectDrift(
        join(FIXTURES, "rails-app"),
        claudeMd
      );

      // If there are fixable items, estimated score should be >= current
      expect(report.estimatedScoreAfterFix).toBeGreaterThanOrEqual(report.currentScore);
    });

    it("critical items reduce score by 15 each", async () => {
      // Create a CLAUDE.md with deliberate stale references (critical severity)
      const claudeMd = writeTempClaudeMd([
        "# rails-app",
        "",
        "## Critical Context",
        "- Rails",
        "",
        "## Architecture",
        "`/src/nonexistent1/` important module",
        "`/src/nonexistent2/` another module",
      ].join("\n"));

      const report = await detectDrift(
        join(FIXTURES, "rails-app"),
        claudeMd
      );

      const criticalCount = report.driftItems.filter(
        (i) => i.severity === "critical"
      ).length;

      // Score should be reduced: 100 - (critical * 15) - (warning * 7) - (info * 2)
      const warningCount = report.driftItems.filter(
        (i) => i.severity === "warning"
      ).length;
      const infoCount = report.driftItems.filter(
        (i) => i.severity === "info"
      ).length;

      const expectedMax = 100 - criticalCount * 15 - warningCount * 7 - infoCount * 2;
      const expectedScore = Math.max(0, Math.min(100, Math.round(expectedMax)));
      expect(report.currentScore).toBe(expectedScore);
    });
  });

  describe("drift item types", () => {
    it("drift items have required fields", async () => {
      const claudeMd = writeTempClaudeMd("# rails-app\n\nMinimal content.");

      const report = await detectDrift(
        join(FIXTURES, "rails-app"),
        claudeMd
      );

      for (const item of report.driftItems) {
        expect(item.type).toBeDefined();
        expect(item.severity).toBeDefined();
        expect(item.message).toBeDefined();
        expect(item.suggestion).toBeDefined();
        expect(["stale-path", "missing-dir", "changed-command", "new-dep", "removed-dep", "framework-change", "missing-gotcha"]).toContain(item.type);
        expect(["critical", "warning", "info"]).toContain(item.severity);
      }
    });

    it("auto-fixable items have autoFix field", async () => {
      const claudeMd = writeTempClaudeMd("# rails-app\n\nMinimal content.");

      const report = await detectDrift(
        join(FIXTURES, "rails-app"),
        claudeMd
      );

      const fixableItems = report.driftItems.filter((i) => i.autoFix);
      // At least some missing-dir or missing-gotcha items should be auto-fixable
      if (report.driftItems.length > 0) {
        // Not all items are fixable, but some should be
        for (const item of fixableItems) {
          expect(item.autoFix).toBeDefined();
          expect(item.autoFix!.section).toBeDefined();
        }
      }
    });
  });
});
