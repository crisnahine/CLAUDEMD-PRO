import { describe, it, expect } from "vitest";
import { calculateScore, totalScore, DIMENSION_WEIGHTS } from "../../src/linter/index.js";
import type { LintResult } from "../../src/linter/types.js";

function makeResult(ruleId: string, severity: "error" | "warning" | "suggestion" = "error"): LintResult {
  return { ruleId, severity, message: `test ${ruleId}` };
}

describe("Scoring Engine", () => {
  describe("tokenEfficiency", () => {
    it("scores 30 for very short content (<100 tokens)", () => {
      const content = "x".repeat(200); // ~50 tokens
      const score = calculateScore(content, []);
      expect(score.tokenEfficiency).toBe(30);
    });

    it("scores 60 for short content (100-300 tokens)", () => {
      const content = "x".repeat(800); // ~200 tokens
      const score = calculateScore(content, []);
      expect(score.tokenEfficiency).toBe(60);
    });

    it("scores 100 for optimal length (500-3000 tokens)", () => {
      const content = "x".repeat(4000); // ~1000 tokens
      const score = calculateScore(content, []);
      expect(score.tokenEfficiency).toBe(100);
    });

    it("degrades for over-budget content (>3000 tokens)", () => {
      const content = "x".repeat(16000); // ~4000 tokens
      const score = calculateScore(content, []);
      expect(score.tokenEfficiency).toBeLessThan(100);
      expect(score.tokenEfficiency).toBeGreaterThanOrEqual(20);
    });

    it("penalizes token-bloat violations", () => {
      const content = "x".repeat(4000);
      const results = [makeResult("token-bloat", "warning")];
      const score = calculateScore(content, results);
      expect(score.tokenEfficiency).toBe(90);
    });

    it("accepts accurate token count parameter", () => {
      const content = "x".repeat(4000); // estimate ~1000 tokens
      const score = calculateScore(content, [], 50); // override with 50 tokens
      expect(score.tokenEfficiency).toBe(30); // < 100 tokens → 30
    });
  });

  describe("actionability", () => {
    it("starts at 80 with no violations", () => {
      const score = calculateScore("## Commands\nnpm test", []);
      expect(score.actionability).toBe(80);
    });

    it("penalizes vague instructions", () => {
      const results = [makeResult("vague", "warning"), makeResult("vague", "warning")];
      const score = calculateScore("## Commands\nnpm test", results);
      expect(score.actionability).toBe(50); // 80 - 2*15
    });

    it("penalizes context-efficiency issues", () => {
      const results = [makeResult("context-efficiency", "suggestion")];
      const score = calculateScore("## Commands\nnpm test", results);
      expect(score.actionability).toBe(75); // 80 - 5
    });

    it("does NOT penalize actionability for style-vs-linter (no double-counting)", () => {
      const results = [makeResult("style-vs-linter", "warning")];
      const score = calculateScore("## Commands\nnpm test", results);
      expect(score.actionability).toBe(80); // unchanged
    });

    it("does NOT penalize actionability for missing-verify (no double-counting)", () => {
      const results = [makeResult("missing-verify", "error")];
      const score = calculateScore("## Commands\nnpm test", results);
      expect(score.actionability).toBe(80); // unchanged — missing-verify affects coverage only
    });
  });

  describe("coverage", () => {
    it("starts at 100 with no violations", () => {
      const content = "## A\n## B\n## C\n## D\n";
      const score = calculateScore(content, []);
      expect(score.coverage).toBe(100);
    });

    it("penalizes missing architecture section", () => {
      const content = "## A\n## B\n## C\n";
      const results = [makeResult("no-architecture", "warning")];
      const score = calculateScore(content, results);
      expect(score.coverage).toBe(80); // 100 - 20
    });

    it("penalizes missing-verify", () => {
      const content = "## A\n## B\n## C\n";
      const results = [makeResult("missing-verify", "error")];
      const score = calculateScore(content, results);
      expect(score.coverage).toBe(80); // 100 - 20
    });

    it("penalizes few sections", () => {
      const content = "## A\n";
      const score = calculateScore(content, []);
      expect(score.coverage).toBe(80); // 100 - 20 for < 3 sections
    });
  });

  describe("specificity", () => {
    it("starts at 90 with no violations", () => {
      const score = calculateScore("some content", []);
      expect(score.specificity).toBe(90);
    });

    it("penalizes style-vs-linter issues", () => {
      const results = [makeResult("style-vs-linter", "warning")];
      const score = calculateScore("some content", results);
      expect(score.specificity).toBe(80); // 90 - 10
    });

    it("penalizes redundant rules", () => {
      const results = [makeResult("redundant", "warning")];
      const score = calculateScore("some content", results);
      expect(score.specificity).toBe(80); // 90 - 10
    });

    it("does NOT penalize specificity for vague (no double-counting)", () => {
      const results = [makeResult("vague", "warning")];
      const score = calculateScore("some content", results);
      expect(score.specificity).toBe(90); // unchanged — vague affects actionability only
    });
  });

  describe("freshness", () => {
    it("starts at 100", () => {
      const score = calculateScore("some content", []);
      expect(score.freshness).toBe(100);
    });

    it("penalizes stale references", () => {
      const results = [makeResult("stale-ref", "error"), makeResult("stale-ref", "error")];
      const score = calculateScore("some content", results);
      expect(score.freshness).toBe(60); // 100 - 2*20
    });
  });

  describe("antiPatternFree", () => {
    it("starts at 100", () => {
      const score = calculateScore("some content", []);
      expect(score.antiPatternFree).toBe(100);
    });

    it("penalizes duplicate-content", () => {
      const results = [makeResult("duplicate-content", "warning")];
      const score = calculateScore("some content", results);
      expect(score.antiPatternFree).toBe(85); // 100 - 15
    });

    it("penalizes token-budget violations", () => {
      const results = [makeResult("token-budget", "error")];
      const score = calculateScore("some content", results);
      expect(score.antiPatternFree).toBe(80); // 100 - 20
    });

    it("penalizes no-imports for large docs", () => {
      const results = [makeResult("no-imports", "suggestion")];
      const score = calculateScore("some content", results);
      expect(score.antiPatternFree).toBe(90); // 100 - 10
    });

    it("does NOT penalize antiPatternFree for generic errors (no blanket penalty)", () => {
      const results = [makeResult("stale-ref", "error")];
      const score = calculateScore("some content", results);
      expect(score.antiPatternFree).toBe(100); // stale-ref affects freshness, not antiPatternFree
    });
  });

  describe("boundary clamping", () => {
    it("never goes below 0", () => {
      const results = Array.from({ length: 20 }, () => makeResult("vague", "warning"));
      const score = calculateScore("x", results);
      expect(score.actionability).toBe(0);
      expect(score.actionability).toBeGreaterThanOrEqual(0);
    });

    it("never exceeds 100", () => {
      const score = calculateScore("x".repeat(4000), []);
      for (const val of Object.values(score)) {
        expect(val).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("totalScore (weighted)", () => {
    it("returns 100 for perfect scores", () => {
      const breakdown = {
        tokenEfficiency: 100,
        actionability: 100,
        coverage: 100,
        specificity: 100,
        freshness: 100,
        antiPatternFree: 100,
      };
      expect(totalScore(breakdown)).toBe(100);
    });

    it("returns 0 for all-zero scores", () => {
      const breakdown = {
        tokenEfficiency: 0,
        actionability: 0,
        coverage: 0,
        specificity: 0,
        freshness: 0,
        antiPatternFree: 0,
      };
      expect(totalScore(breakdown)).toBe(0);
    });

    it("weights token efficiency and freshness higher", () => {
      // Only tokenEfficiency is high, rest zero
      const a = totalScore({
        tokenEfficiency: 100, actionability: 0, coverage: 0,
        specificity: 0, freshness: 0, antiPatternFree: 0,
      });
      // Only coverage is high, rest zero
      const b = totalScore({
        tokenEfficiency: 0, actionability: 0, coverage: 100,
        specificity: 0, freshness: 0, antiPatternFree: 0,
      });
      // tokenEfficiency weight (1.2) > coverage weight (0.8)
      expect(a).toBeGreaterThan(b);
    });

    it("has correct weights exported", () => {
      expect(DIMENSION_WEIGHTS.tokenEfficiency).toBe(1.2);
      expect(DIMENSION_WEIGHTS.freshness).toBe(1.2);
      expect(DIMENSION_WEIGHTS.coverage).toBe(0.8);
    });
  });

  describe("no double-counting verification", () => {
    it("vague only penalizes actionability", () => {
      const content = "## A\n## B\n## C\n";
      const baseline = calculateScore(content, []);
      const withVague = calculateScore(content, [makeResult("vague", "warning")]);

      expect(withVague.actionability).toBeLessThan(baseline.actionability);
      expect(withVague.specificity).toBe(baseline.specificity);
      expect(withVague.coverage).toBe(baseline.coverage);
      expect(withVague.antiPatternFree).toBe(baseline.antiPatternFree);
    });

    it("missing-verify only penalizes coverage", () => {
      const content = "## A\n## B\n## C\n";
      const baseline = calculateScore(content, []);
      const withVerify = calculateScore(content, [makeResult("missing-verify", "error")]);

      expect(withVerify.coverage).toBeLessThan(baseline.coverage);
      expect(withVerify.actionability).toBe(baseline.actionability);
      expect(withVerify.specificity).toBe(baseline.specificity);
    });

    it("style-vs-linter only penalizes specificity", () => {
      const content = "## A\n## B\n## C\n";
      const baseline = calculateScore(content, []);
      const withStyle = calculateScore(content, [makeResult("style-vs-linter", "warning")]);

      expect(withStyle.specificity).toBeLessThan(baseline.specificity);
      expect(withStyle.actionability).toBe(baseline.actionability);
      expect(withStyle.antiPatternFree).toBe(baseline.antiPatternFree);
    });
  });
});
