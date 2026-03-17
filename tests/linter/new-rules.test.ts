import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { buildContext } from "../../src/linter/index.js";
import { emptySectionRule } from "../../src/linter/rules/empty-section.js";
import { missingTestingRule } from "../../src/linter/rules/missing-testing.js";
import { missingDbContextRule } from "../../src/linter/rules/missing-db-context.js";
import { inconsistentPkgManagerRule } from "../../src/linter/rules/inconsistent-pkg-manager.js";
import { brokenMarkdownRule } from "../../src/linter/rules/broken-markdown.js";
import { missingEnvSetupRule } from "../../src/linter/rules/missing-env-setup.js";
import { excessiveNestingRule } from "../../src/linter/rules/excessive-nesting.js";
import { unresolvedPlaceholdersRule } from "../../src/linter/rules/unresolved-placeholders.js";

// Track temp directories for cleanup
const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "claudemd-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    if (existsSync(dir)) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
  tempDirs.length = 0;
});

describe("New Lint Rules", () => {
  // ─── empty-section ──────────────────────────────────────────
  describe("empty-section", () => {
    it("flags sections with no meaningful content", () => {
      const content = [
        "## Empty Section",
        "",
        "## Filled Section",
        "This section has meaningful content that explains things.",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = emptySectionRule.run(ctx);

      expect(results.length).toBe(1);
      expect(results[0].ruleId).toBe("empty-section");
      expect(results[0].message).toContain("Empty Section");
    });

    it("flags sections with only whitespace", () => {
      const content = [
        "## Whitespace Only",
        "   ",
        "  ",
        "",
        "## Good Section",
        "Some real content with enough characters to pass.",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = emptySectionRule.run(ctx);

      expect(results.length).toBe(1);
      expect(results[0].message).toContain("Whitespace Only");
    });

    it("flags sections with very short content (less than 10 non-whitespace chars)", () => {
      const content = [
        "## Tiny",
        "Hi",
        "",
        "## Good",
        "This section has enough meaningful text.",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = emptySectionRule.run(ctx);

      expect(results.length).toBe(1);
      expect(results[0].message).toContain("Tiny");
    });

    it("does not flag sections with sufficient content", () => {
      const content = [
        "## Architecture",
        "/src/ contains the main source code and modules",
        "/tests/ contains the test suite",
        "",
        "## Commands",
        "npm run dev        # Start dev server",
        "npm test           # Run tests",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = emptySectionRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("flags multiple empty sections", () => {
      const content = [
        "## Empty A",
        "",
        "## Empty B",
        "",
        "## Good",
        "This has enough content to be valid.",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = emptySectionRule.run(ctx);

      expect(results.length).toBe(2);
    });
  });

  // ─── missing-testing ────────────────────────────────────────
  describe("missing-testing", () => {
    it("flags when project has tests/ but CLAUDE.md has no testing info", () => {
      const dir = createTempDir();
      mkdirSync(join(dir, "tests"));
      const content = "## Architecture\n/src/ Source code\n/lib/ Library code";
      const ctx = buildContext(content, dir);
      const results = missingTestingRule.run(ctx);

      expect(results.length).toBe(1);
      expect(results[0].ruleId).toBe("missing-testing");
      expect(results[0].severity).toBe("warning");
    });

    it("flags when project has __tests__/ but no test mention", () => {
      const dir = createTempDir();
      mkdirSync(join(dir, "__tests__"));
      const content = "## Commands\nnpm run build";
      const ctx = buildContext(content, dir);
      const results = missingTestingRule.run(ctx);

      expect(results.length).toBe(1);
    });

    it("does not flag when content mentions testing", () => {
      const dir = createTempDir();
      mkdirSync(join(dir, "tests"));
      const content = "## Commands\nnpm test\n\nRun the test suite before pushing.";
      const ctx = buildContext(content, dir);
      const results = missingTestingRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("does not flag when content has a Testing section", () => {
      const dir = createTempDir();
      mkdirSync(join(dir, "tests"));
      const content = "## Testing\nWe use vitest for unit tests.";
      const ctx = buildContext(content, dir);
      const results = missingTestingRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("does not flag when project has no test directories", () => {
      const dir = createTempDir();
      mkdirSync(join(dir, "src"));
      const content = "## Architecture\nSimple project.";
      const ctx = buildContext(content, dir);
      const results = missingTestingRule.run(ctx);

      expect(results).toHaveLength(0);
    });
  });

  // ─── missing-db-context ─────────────────────────────────────
  describe("missing-db-context", () => {
    it("flags when prisma/schema.prisma exists but no DB info in content", () => {
      const dir = createTempDir();
      mkdirSync(join(dir, "prisma"), { recursive: true });
      writeFileSync(join(dir, "prisma", "schema.prisma"), "model User { id Int @id }");
      const content = "## Commands\nnpm run dev";
      const ctx = buildContext(content, dir);
      const results = missingDbContextRule.run(ctx);

      expect(results.length).toBe(1);
      expect(results[0].ruleId).toBe("missing-db-context");
    });

    it("flags when db/schema.rb exists but no DB info in content", () => {
      const dir = createTempDir();
      mkdirSync(join(dir, "db"), { recursive: true });
      writeFileSync(join(dir, "db", "schema.rb"), "create_table :users");
      const content = "## Commands\nbundle exec rspec";
      const ctx = buildContext(content, dir);
      const results = missingDbContextRule.run(ctx);

      expect(results.length).toBe(1);
    });

    it("flags when migrations/ dir exists but no DB info", () => {
      const dir = createTempDir();
      mkdirSync(join(dir, "migrations"), { recursive: true });
      const content = "## Commands\nSome command";
      const ctx = buildContext(content, dir);
      const results = missingDbContextRule.run(ctx);

      expect(results.length).toBe(1);
    });

    it("does not flag when content mentions database", () => {
      const dir = createTempDir();
      mkdirSync(join(dir, "prisma"), { recursive: true });
      writeFileSync(join(dir, "prisma", "schema.prisma"), "model User { id Int @id }");
      const content = "## Database\nUsing Prisma ORM with PostgreSQL.";
      const ctx = buildContext(content, dir);
      const results = missingDbContextRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("does not flag when content mentions ORM", () => {
      const dir = createTempDir();
      mkdirSync(join(dir, "prisma"), { recursive: true });
      writeFileSync(join(dir, "prisma", "schema.prisma"), "model User { id Int @id }");
      const content = "## Architecture\nUsing Prisma as the ORM layer.";
      const ctx = buildContext(content, dir);
      const results = missingDbContextRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("does not flag when no DB indicators exist", () => {
      const dir = createTempDir();
      mkdirSync(join(dir, "src"));
      const content = "## Architecture\nSimple frontend app.";
      const ctx = buildContext(content, dir);
      const results = missingDbContextRule.run(ctx);

      expect(results).toHaveLength(0);
    });
  });

  // ─── inconsistent-pkg-manager ───────────────────────────────
  describe("inconsistent-pkg-manager", () => {
    it("flags npm run in a pnpm project", () => {
      const dir = createTempDir();
      writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: 5");
      const content = "## Commands\nnpm run dev\nnpm run build";
      const ctx = buildContext(content, dir);
      const results = inconsistentPkgManagerRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].ruleId).toBe("inconsistent-pkg-manager");
      expect(results[0].message).toContain("pnpm");
    });

    it("flags yarn commands in a pnpm project", () => {
      const dir = createTempDir();
      writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: 5");
      const content = "## Commands\nyarn run dev";
      const ctx = buildContext(content, dir);
      const results = inconsistentPkgManagerRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].message).toContain("pnpm");
    });

    it("flags pnpm commands in a yarn project", () => {
      const dir = createTempDir();
      writeFileSync(join(dir, "yarn.lock"), "# yarn lockfile");
      const content = "## Commands\npnpm run dev\npnpm add some-package";
      const ctx = buildContext(content, dir);
      const results = inconsistentPkgManagerRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].message).toContain("yarn");
    });

    it("flags npm run in a bun project", () => {
      const dir = createTempDir();
      writeFileSync(join(dir, "bun.lockb"), "");
      const content = "## Commands\nnpm run dev";
      const ctx = buildContext(content, dir);
      const results = inconsistentPkgManagerRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].message).toContain("bun");
    });

    it("does not flag when correct package manager is used", () => {
      const dir = createTempDir();
      writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: 5");
      const content = "## Commands\npnpm run dev\npnpm run build";
      const ctx = buildContext(content, dir);
      const results = inconsistentPkgManagerRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("defaults to npm when no lock file exists", () => {
      const dir = createTempDir();
      const content = "## Commands\nnpm run dev";
      const ctx = buildContext(content, dir);
      const results = inconsistentPkgManagerRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("flags pnpm in an npm project (no lockfile)", () => {
      const dir = createTempDir();
      const content = "## Commands\npnpm run dev";
      const ctx = buildContext(content, dir);
      const results = inconsistentPkgManagerRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ─── broken-markdown ────────────────────────────────────────
  describe("broken-markdown", () => {
    it("flags unclosed code blocks", () => {
      const content = [
        "## Commands",
        "```",
        "npm run dev",
        "",
        "## Architecture",
        "Some content",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = brokenMarkdownRule.run(ctx);

      const unclosedFence = results.find((r) =>
        r.message.includes("Unclosed code block")
      );
      expect(unclosedFence).toBeDefined();
      expect(unclosedFence!.severity).toBe("error");
    });

    it("does not flag properly closed code blocks", () => {
      const content = [
        "## Commands",
        "```",
        "npm run dev",
        "```",
        "",
        "## Architecture",
        "Some content",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = brokenMarkdownRule.run(ctx);

      const unclosedFence = results.find((r) =>
        r.message.includes("Unclosed code block")
      );
      expect(unclosedFence).toBeUndefined();
    });

    it("flags headers with no space after #", () => {
      const content = [
        "#NoSpace",
        "##AlsoNoSpace",
        "### Correct heading",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = brokenMarkdownRule.run(ctx);

      const malformedHeadings = results.filter((r) =>
        r.message.includes("Malformed heading")
      );
      expect(malformedHeadings.length).toBe(2);
    });

    it("does not flag valid headings", () => {
      const content = [
        "# Project Name",
        "## Section",
        "### Subsection",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = brokenMarkdownRule.run(ctx);

      const malformedHeadings = results.filter((r) =>
        r.message.includes("Malformed heading")
      );
      expect(malformedHeadings).toHaveLength(0);
    });

    it("flags excessive consecutive blank lines", () => {
      const content = [
        "## Section 1",
        "Content",
        "",
        "",
        "",
        "",
        "## Section 2",
        "Content",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = brokenMarkdownRule.run(ctx);

      const blankLines = results.find((r) =>
        r.message.includes("Excessive blank lines")
      );
      expect(blankLines).toBeDefined();
    });

    it("does not flag 3 or fewer consecutive blank lines", () => {
      const content = [
        "## Section 1",
        "Content",
        "",
        "",
        "",
        "## Section 2",
        "Content",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = brokenMarkdownRule.run(ctx);

      const blankLines = results.find((r) =>
        r.message.includes("Excessive blank lines")
      );
      expect(blankLines).toBeUndefined();
    });

    it("detects multiple issues at once", () => {
      const content = [
        "#NoSpace heading",
        "```",
        "code block never closed",
        "",
        "",
        "",
        "",
        "more content",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = brokenMarkdownRule.run(ctx);

      // Should flag: malformed heading + unclosed code block + excessive blanks
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── missing-env-setup ──────────────────────────────────────
  describe("missing-env-setup", () => {
    it("flags when .env.example exists but no env info in content", () => {
      const dir = createTempDir();
      writeFileSync(join(dir, ".env.example"), "DATABASE_URL=\nSECRET_KEY=");
      const content = "## Architecture\nSimple project.";
      const ctx = buildContext(content, dir);
      const results = missingEnvSetupRule.run(ctx);

      expect(results.length).toBe(1);
      expect(results[0].ruleId).toBe("missing-env-setup");
    });

    it("flags when .env exists but no env info in content", () => {
      const dir = createTempDir();
      writeFileSync(join(dir, ".env"), "DATABASE_URL=localhost");
      const content = "## Commands\nnpm run dev";
      const ctx = buildContext(content, dir);
      const results = missingEnvSetupRule.run(ctx);

      expect(results.length).toBe(1);
    });

    it("does not flag when content mentions .env", () => {
      const dir = createTempDir();
      writeFileSync(join(dir, ".env.example"), "DATABASE_URL=");
      const content = "## Setup\nCopy .env.example to .env and fill in values.";
      const ctx = buildContext(content, dir);
      const results = missingEnvSetupRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("does not flag when content has Environment section", () => {
      const dir = createTempDir();
      writeFileSync(join(dir, ".env.example"), "DATABASE_URL=");
      const content = "## Environment Variables\nDATABASE_URL required for PostgreSQL.";
      const ctx = buildContext(content, dir);
      const results = missingEnvSetupRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("does not flag when content has Configuration section", () => {
      const dir = createTempDir();
      writeFileSync(join(dir, ".env.example"), "DATABASE_URL=");
      const content = "## Configuration\nSet up required environment variables.";
      const ctx = buildContext(content, dir);
      const results = missingEnvSetupRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("does not flag when no .env files exist", () => {
      const dir = createTempDir();
      const content = "## Architecture\nFrontend only, no env needed.";
      const ctx = buildContext(content, dir);
      const results = missingEnvSetupRule.run(ctx);

      expect(results).toHaveLength(0);
    });
  });

  // ─── excessive-nesting ──────────────────────────────────────
  describe("excessive-nesting", () => {
    it("flags heading level 4 and deeper", () => {
      const content = [
        "## Section",
        "### Subsection",
        "#### Deep heading",
        "##### Very deep heading",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = excessiveNestingRule.run(ctx);

      expect(results.length).toBe(2);
      expect(results[0].ruleId).toBe("excessive-nesting");
      expect(results[0].message).toContain("level 4");
      expect(results[1].message).toContain("level 5");
    });

    it("does not flag heading levels 1-3", () => {
      const content = [
        "# Project",
        "## Section",
        "### Subsection",
        "Some content here.",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = excessiveNestingRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("flags multiple deeply nested headings", () => {
      const content = [
        "## Section A",
        "#### Deep A",
        "## Section B",
        "#### Deep B",
        "#### Deep C",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = excessiveNestingRule.run(ctx);

      expect(results.length).toBe(3);
    });

    it("reports correct line numbers", () => {
      const content = [
        "## Section",       // line 1
        "Content",          // line 2
        "#### Deep Heading", // line 3
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = excessiveNestingRule.run(ctx);

      expect(results.length).toBe(1);
      expect(results[0].line).toBe(3);
    });

    it("has suggestion severity", () => {
      const content = "#### Deep heading\nContent.";
      const ctx = buildContext(content, process.cwd());
      const results = excessiveNestingRule.run(ctx);

      expect(results[0].severity).toBe("suggestion");
    });
  });

  // ─── unresolved-placeholders ────────────────────────────────
  describe("unresolved-placeholders", () => {
    it("flags TODO comments", () => {
      const content = "## Section\nTODO: fill this in later.";
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].ruleId).toBe("unresolved-placeholders");
      expect(results[0].message).toContain("TODO");
    });

    it("flags FIXME comments", () => {
      const content = "## Section\nFIXME: this is wrong.";
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].message).toContain("FIXME");
    });

    it("flags TBD markers", () => {
      const content = "## Database\nORM: TBD";
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].message).toContain("TBD");
    });

    it("flags XXX markers", () => {
      const content = "## Section\nXXX needs review";
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
    });

    it("flags PLACEHOLDER text", () => {
      const content = "## Section\nPLACEHOLDER content here.";
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
    });

    it("flags <insert> tags", () => {
      const content = "## Section\nProject name: <insert project name>";
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
    });

    it("flags [fill in] markers", () => {
      const content = "## Section\nDatabase: [fill in]";
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
    });

    it("flags {REPLACE} markers", () => {
      const content = "## Section\nRun {REPLACE_WITH_COMMAND} to start.";
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
    });

    it("flags ??? markers", () => {
      const content = "## Section\nDatabase adapter: ???";
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results.length).toBeGreaterThan(0);
    });

    it("does not flag clean content", () => {
      const content = [
        "## Critical Context",
        "- TypeScript 5.0",
        "- Next.js 14",
        "",
        "## Commands",
        "npm run dev    # Start dev server",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results).toHaveLength(0);
    });

    it("flags multiple placeholders in the same content", () => {
      const content = [
        "## Section",
        "TODO: add commands",
        "FIXME: wrong path",
        "TBD what framework",
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it("reports correct line numbers", () => {
      const content = [
        "## Section",      // line 1
        "Good content",    // line 2
        "TODO: fix this",  // line 3
      ].join("\n");
      const ctx = buildContext(content, process.cwd());
      const results = unresolvedPlaceholdersRule.run(ctx);

      expect(results.length).toBe(1);
      expect(results[0].line).toBe(3);
    });
  });
});
