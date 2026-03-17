import { describe, it, expect } from "vitest";
import { buildContext, runRules, calculateScore, totalScore } from "../../src/linter/index.js";

describe("Modular Lint Rules", () => {
  const rootDir = process.cwd();

  describe("token-budget", () => {
    it("errors when over 4000 tokens", () => {
      const content = "x".repeat(16001);
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["token-budget"] });
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe("error");
      expect(results[0].ruleId).toBe("token-budget");
    });

    it("warns between 3000-4000 tokens", () => {
      const content = "x".repeat(13000);
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["token-budget"] });
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe("warning");
    });

    it("passes under 3000 tokens", () => {
      const content = "x".repeat(8000);
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["token-budget"] });
      expect(results).toHaveLength(0);
    });
  });

  describe("missing-verify", () => {
    it("passes when verification commands exist", () => {
      const content = "## Commands\n```\nnpm test\nnpm run lint\n```";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["missing-verify"] });
      expect(results).toHaveLength(0);
    });

    it("errors when no verification commands", () => {
      const content = "## Architecture\nThis is a project.";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["missing-verify"] });
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe("error");
    });

    it("detects Go test command", () => {
      const content = "Run go test ./... for tests";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["missing-verify"] });
      expect(results).toHaveLength(0);
    });

    it("detects Rust cargo test", () => {
      const content = "Run cargo test for tests";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["missing-verify"] });
      expect(results).toHaveLength(0);
    });
  });

  describe("vague", () => {
    it("flags vague instructions", () => {
      const content = "## Rules\n- follow best practices\n- write clean code";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["vague"] });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it("passes specific instructions", () => {
      const content = "## Rules\n- Use service objects for multi-model operations\n- Extract queries to scopes";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["vague"] });
      expect(results).toHaveLength(0);
    });
  });

  describe("style-vs-linter", () => {
    it("flags formatting rules", () => {
      const content = "prefer single quotes for strings";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["style-vs-linter"] });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("no-architecture", () => {
    it("warns when no architecture section", () => {
      const content = "## Commands\nnpm test";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["no-architecture"] });
      expect(results).toHaveLength(1);
    });

    it("passes with architecture section", () => {
      const content = "## Architecture\n/src/ - source code";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["no-architecture"] });
      expect(results).toHaveLength(0);
    });
  });

  describe("missing-patterns", () => {
    it("suggests patterns section for Rails", () => {
      const content = "## Commands\nnpm test";
      const ctx = buildContext(content, rootDir, "ruby", "rails");
      const results = runRules(ctx, { rules: ["missing-patterns"] });
      expect(results).toHaveLength(1);
    });

    it("skips for generic projects", () => {
      const content = "## Commands\nnpm test";
      const ctx = buildContext(content, rootDir, "typescript", "unknown");
      const results = runRules(ctx, { rules: ["missing-patterns"] });
      expect(results).toHaveLength(0);
    });
  });

  describe("duplicate-content", () => {
    it("detects duplicated lines across sections", () => {
      const content = [
        "## Commands",
        "Always run the full test suite before committing changes to the repository",
        "",
        "## Testing",
        "Always run the full test suite before committing changes to the repository",
      ].join("\n");
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, { rules: ["duplicate-content"] });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("rule overrides", () => {
    it("respects severity overrides", () => {
      const content = "## Architecture\nNo gotchas section here.";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, {
        rules: ["missing-gotchas"],
        overrides: { "missing-gotchas": "error" },
      });
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe("error");
    });

    it("respects rule disabling", () => {
      const content = "follow best practices";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx, {
        overrides: { vague: "off" },
      });
      expect(results.every((r) => r.ruleId !== "vague")).toBe(true);
    });
  });

  describe("scoring", () => {
    it("gives high score to a good CLAUDE.md", () => {
      const content = [
        "# My Project",
        "",
        "## Critical Context",
        "- TypeScript 5.0",
        "- Next.js 14",
        "",
        "## Commands",
        "```",
        "npm run dev    # Dev server",
        "npm test       # Run vitest",
        "npm run lint   # ESLint",
        "```",
        "",
        "## Architecture",
        "/src/app/      # App Router pages",
        "/src/lib/      # Shared utils",
        "",
        "## Key Patterns",
        "- Server components by default",
        "- Client components in /src/components/client/",
        "",
        "## Gotchas",
        "- DON'T modify .next/ directory",
        "- DON'T use 'use client' unless needed",
      ].join("\n");
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx);
      const score = calculateScore(content, results);
      const total = totalScore(score);
      expect(total).toBeGreaterThanOrEqual(70);
    });

    it("gives low score to a bad CLAUDE.md", () => {
      const content = "follow best practices and write clean code";
      const ctx = buildContext(content, rootDir);
      const results = runRules(ctx);
      const score = calculateScore(content, results);
      const total = totalScore(score);
      // Score is higher than before because we fixed double-counting
      // (vague no longer penalizes both actionability AND specificity)
      expect(total).toBeLessThan(70);
    });
  });
});
