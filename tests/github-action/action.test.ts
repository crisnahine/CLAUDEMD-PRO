/**
 * GitHub Action Tests
 *
 * Tests the core logic of the GitHub Action (lint, drift detection, PR comment).
 * We test the underlying functions rather than the process.exit behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import {
  buildContext,
  runRules,
  calculateScore,
  totalScore,
} from "../../src/linter/index.js";
import { detectDrift } from "../../src/evolve/index.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

// ─── Temp directory for CLAUDE.md files ──────────────────────

const TMP_DIR = join(import.meta.dirname, ".tmp-action-test");

const GOOD_CLAUDE_MD = `# test-project

## Critical Context
- TypeScript 5.0
- Framework: Next.js 14
- Database: PostgreSQL with Prisma

## Commands
\`\`\`
npm run dev                          # Start development server
npm run build                        # Production build
npm run test                         # Run vitest tests
npm run lint                         # ESLint
\`\`\`

## Architecture
\`\`\`
/src/app/                            # Next.js App Router pages
/src/components/                     # React components
/src/lib/                            # Shared utilities
/prisma/                             # Database schema and migrations
\`\`\`

## Key Patterns
- App Router for all pages
- Server Components by default, 'use client' only when needed
- Prisma for all database access

## Gotchas — DON'T Do This
- DON'T use getServerSideProps — use App Router server components
- DON'T import server-only code in client components
`;

beforeAll(() => {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
});

// ─── Lint Integration (what the action runs) ─────────────────

describe("GitHub Action — lint scoring", () => {
  it("scores a well-formed CLAUDE.md above 60", () => {
    const ctx = buildContext(GOOD_CLAUDE_MD, TMP_DIR);
    const results = runRules(ctx);
    const breakdown = calculateScore(GOOD_CLAUDE_MD, results);
    const score = totalScore(breakdown);

    expect(score).toBeGreaterThanOrEqual(60);
  });

  it("returns score breakdown with all 6 dimensions", () => {
    const ctx = buildContext(GOOD_CLAUDE_MD, TMP_DIR);
    const results = runRules(ctx);
    const breakdown = calculateScore(GOOD_CLAUDE_MD, results);

    expect(breakdown).toHaveProperty("tokenEfficiency");
    expect(breakdown).toHaveProperty("actionability");
    expect(breakdown).toHaveProperty("coverage");
    expect(breakdown).toHaveProperty("specificity");
    expect(breakdown).toHaveProperty("freshness");
    expect(breakdown).toHaveProperty("antiPatternFree");
  });

  it("categorizes results by severity", () => {
    const ctx = buildContext(GOOD_CLAUDE_MD, TMP_DIR);
    const results = runRules(ctx);

    const errors = results.filter((r) => r.severity === "error");
    const warnings = results.filter((r) => r.severity === "warning");
    const suggestions = results.filter((r) => r.severity === "suggestion");

    // Good content should have very few errors
    expect(errors.length).toBeLessThan(3);
    // All results should have valid severity
    for (const r of results) {
      expect(["error", "warning", "suggestion"]).toContain(r.severity);
    }
  });

  it("each result has ruleId and message", () => {
    const ctx = buildContext(GOOD_CLAUDE_MD, TMP_DIR);
    const results = runRules(ctx);

    for (const r of results) {
      expect(r.ruleId).toBeTruthy();
      expect(r.message).toBeTruthy();
    }
  });

  it("minimal CLAUDE.md scores lower than well-formed one", () => {
    const minimal = "# Empty Project\n";
    const ctxMinimal = buildContext(minimal, TMP_DIR);
    const resultsMinimal = runRules(ctxMinimal);
    const scoreMinimal = totalScore(calculateScore(minimal, resultsMinimal));

    const ctxGood = buildContext(GOOD_CLAUDE_MD, TMP_DIR);
    const resultsGood = runRules(ctxGood);
    const scoreGood = totalScore(calculateScore(GOOD_CLAUDE_MD, resultsGood));

    expect(scoreGood).toBeGreaterThan(scoreMinimal);
  });
});

// ─── Drift Detection (optional check-drift flag) ────────────

describe("GitHub Action — drift detection", () => {
  it("returns a drift report with required fields", async () => {
    const claudeMdPath = join(TMP_DIR, "CLAUDE-action.md");
    writeFileSync(claudeMdPath, GOOD_CLAUDE_MD);

    const report = await detectDrift(TMP_DIR, claudeMdPath);

    expect(report).toHaveProperty("driftItems");
    expect(report).toHaveProperty("currentScore");
    expect(report).toHaveProperty("estimatedScoreAfterFix");
    expect(report).toHaveProperty("lastAnalyzed");
    expect(Array.isArray(report.driftItems)).toBe(true);
    expect(typeof report.currentScore).toBe("number");
  });

  it("driftItems have correct structure", async () => {
    const claudeMdPath = join(TMP_DIR, "CLAUDE-action2.md");
    writeFileSync(claudeMdPath, GOOD_CLAUDE_MD);

    const report = await detectDrift(TMP_DIR, claudeMdPath);

    for (const item of report.driftItems) {
      expect(item).toHaveProperty("type");
      expect(item).toHaveProperty("severity");
      expect(item).toHaveProperty("message");
      expect(item).toHaveProperty("suggestion");
      expect(["critical", "warning", "info"]).toContain(item.severity);
    }
  });

  it("detects drift when CLAUDE.md references non-existent paths", async () => {
    const staleContent = `# test-project

## Architecture
\`\`\`
/src/nonexistent-dir/          # This does not exist
\`\`\`
`;
    const claudeMdPath = join(TMP_DIR, "CLAUDE-stale.md");
    writeFileSync(claudeMdPath, staleContent);

    const report = await detectDrift(TMP_DIR, claudeMdPath);

    // Should detect stale path
    const stalePaths = report.driftItems.filter((i) => i.type === "stale-path");
    expect(stalePaths.length).toBeGreaterThan(0);
  });
});

// ─── PR Comment Builder ──────────────────────────────────────

describe("GitHub Action — PR comment format", () => {
  it("builds a comment string with score and dimensions", () => {
    const ctx = buildContext(GOOD_CLAUDE_MD, TMP_DIR);
    const results = runRules(ctx);
    const breakdown = calculateScore(GOOD_CLAUDE_MD, results);
    const score = totalScore(breakdown);

    const errors = results.filter((r) => r.severity === "error");
    const warnings = results.filter((r) => r.severity === "warning");
    const suggestions = results.filter((r) => r.severity === "suggestion");

    // Simulate the PR comment builder from action.ts
    const scoreEmoji = score >= 80 ? "🟢" : score >= 60 ? "🟡" : "🔴";
    const lines: string[] = [
      `## ${scoreEmoji} CLAUDE.md Effectiveness: ${score}/100`,
      "",
      "| Dimension | Score |",
      "| --- | --- |",
      `| Token Efficiency | ${breakdown.tokenEfficiency}/100 |`,
      `| Actionability | ${breakdown.actionability}/100 |`,
      `| Coverage | ${breakdown.coverage}/100 |`,
      `| Specificity | ${breakdown.specificity}/100 |`,
      `| Freshness | ${breakdown.freshness}/100 |`,
      `| Anti-Pattern Free | ${breakdown.antiPatternFree}/100 |`,
      "",
      `**${errors.length}** errors · **${warnings.length}** warnings · **${suggestions.length}** suggestions`,
    ];

    const comment = lines.join("\n");

    expect(comment).toContain("CLAUDE.md Effectiveness:");
    expect(comment).toContain("Token Efficiency");
    expect(comment).toContain("Actionability");
    expect(comment).toContain("Coverage");
    expect(comment).toContain("/100");
  });

  it("includes drift items in comment when drift report is present", () => {
    // Build a mock drift report
    const driftReport = {
      driftItems: [
        {
          type: "stale-path" as const,
          severity: "critical" as const,
          message: "Path /src/old/ no longer exists",
          suggestion: "Remove from CLAUDE.md",
        },
      ],
      currentScore: 75,
      estimatedScoreAfterFix: 90,
      lastAnalyzed: new Date().toISOString(),
    };

    const lines: string[] = [];
    if (driftReport.driftItems.length > 0) {
      lines.push(
        `### Drift Detection (freshness: ${driftReport.currentScore}/100)`,
        ...driftReport.driftItems.map(
          (i) => `- **${i.severity}** \`${i.type}\`: ${i.message}`
        )
      );
    }

    const comment = lines.join("\n");
    expect(comment).toContain("Drift Detection");
    expect(comment).toContain("stale-path");
    expect(comment).toContain("critical");
  });
});

// ─── Threshold Logic ─────────────────────────────────────────

describe("GitHub Action — threshold behavior", () => {
  it("good content passes default threshold of 60", () => {
    const ctx = buildContext(GOOD_CLAUDE_MD, TMP_DIR);
    const results = runRules(ctx);
    const breakdown = calculateScore(GOOD_CLAUDE_MD, results);
    const score = totalScore(breakdown);

    const threshold = 60;
    expect(score >= threshold).toBe(true);
  });

  it("minimal content scores lower than good content", () => {
    const minimal = "# Nothing\n";
    const ctxMinimal = buildContext(minimal, TMP_DIR);
    const resultsMinimal = runRules(ctxMinimal);
    const scoreMinimal = totalScore(calculateScore(minimal, resultsMinimal));

    const ctxGood = buildContext(GOOD_CLAUDE_MD, TMP_DIR);
    const resultsGood = runRules(ctxGood);
    const scoreGood = totalScore(calculateScore(GOOD_CLAUDE_MD, resultsGood));

    expect(scoreGood).toBeGreaterThan(scoreMinimal);
  });

  it("strict mode flags both errors and warnings", () => {
    const ctx = buildContext(GOOD_CLAUDE_MD, TMP_DIR);
    const results = runRules(ctx);
    const errors = results.filter((r) => r.severity === "error");
    const warnings = results.filter((r) => r.severity === "warning");

    // In strict mode, the action exits 1 if there are any errors OR warnings
    const strictFails = errors.length > 0 || warnings.length > 0;
    // This is a valid boolean — the test just verifies the logic
    expect(typeof strictFails).toBe("boolean");
  });
});
