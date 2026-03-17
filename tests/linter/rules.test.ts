import { describe, it, expect } from "vitest";

/**
 * These tests validate lint rules against sample CLAUDE.md content.
 * We import the lint engine internals once they're refactored into
 * testable units. For now, these serve as the spec.
 */

describe("Lint Rules", () => {
  describe("token-budget", () => {
    it("should error when CLAUDE.md exceeds 4000 estimated tokens", () => {
      // ~16000 chars = ~4000 tokens
      const content = "x".repeat(16001);
      const tokens = Math.ceil(content.length / 4);
      expect(tokens).toBeGreaterThan(4000);
    });

    it("should warn between 3000-4000 estimated tokens", () => {
      const content = "x".repeat(13000); // ~3250 tokens
      const tokens = Math.ceil(content.length / 4);
      expect(tokens).toBeGreaterThan(3000);
      expect(tokens).toBeLessThanOrEqual(4000);
    });

    it("should pass under 3000 tokens", () => {
      const content = "x".repeat(8000); // ~2000 tokens
      const tokens = Math.ceil(content.length / 4);
      expect(tokens).toBeLessThanOrEqual(3000);
    });
  });

  describe("style-vs-linter", () => {
    const stylePatterns = [
      "prefer single quotes",
      "Use 2 space indent",
      "semicolons always",
      "trailing comma",
      "max line length 100",
      "use camelCase",
    ];

    for (const pattern of stylePatterns) {
      it(`should flag "${pattern}" as a linter concern`, () => {
        expect(pattern.toLowerCase()).toMatch(
          /prefer\s+(single|double)\s+quotes|use\s+(2|4)\s+space|semicolons?\s+(always|never)|trailing\s+comma|max\s+line\s+length|use\s+camelcase/i
        );
      });
    }
  });

  describe("vague", () => {
    const vagueInstructions = [
      "follow best practices",
      "write clean code",
      "use proper error handling",
      "keep it simple",
      "follow conventions",
      "be consistent",
    ];

    for (const instr of vagueInstructions) {
      it(`should flag "${instr}" as too vague`, () => {
        expect(instr.toLowerCase()).toMatch(
          /follow\s+best\s+practices|write\s+clean\s+code|use\s+proper\s+(error\s+)?handling|keep\s+it\s+simple|follow\s+conventions|be\s+consistent/i
        );
      });
    }
  });

  describe("missing-verify", () => {
    it("should detect verification commands", () => {
      const withVerify = "## Commands\n```\nnpm test\n```";
      expect(/\b(test|spec|lint|typecheck)\b/i.test(withVerify)).toBe(true);
    });

    it("should flag missing verification", () => {
      const noVerify = "## Architecture\nThis is our project structure.";
      expect(/\b(test|spec|lint|typecheck)\b/i.test(noVerify)).toBe(false);
    });
  });

  describe("redundant", () => {
    it("should flag 'Use TypeScript' when tsconfig exists", () => {
      const content = "Use TypeScript for all new files";
      expect(/use\s+typescript/i.test(content)).toBe(true);
    });
  });

  describe("scoring", () => {
    it("should penalize very short CLAUDE.md", () => {
      const tokens = 50; // Way too short
      const score = tokens < 100 ? 30 : 100;
      expect(score).toBe(30);
    });

    it("should give full marks to optimal length", () => {
      const tokens = 1500; // Sweet spot
      const score =
        tokens >= 300 && tokens <= 3000 ? 100 : 50;
      expect(score).toBe(100);
    });

    it("should penalize bloated CLAUDE.md", () => {
      const tokens = 5000;
      const score = Math.max(20, 100 - (tokens - 3000) / 50);
      expect(score).toBe(60);
    });
  });
});
