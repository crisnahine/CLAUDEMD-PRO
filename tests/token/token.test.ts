import { describe, it, expect } from "vitest";
import { estimateTokens, countTokens } from "../../src/token/index.js";

describe("Token Counting", () => {
  describe("estimateTokens", () => {
    it("estimates tokens as chars/4", () => {
      expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 → 3
    });

    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("countTokens", () => {
    it("counts tokens for simple text", async () => {
      const tokens = await countTokens("Hello, world!");
      // Should be roughly 4 tokens — exact count depends on tiktoken availability
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20);
    });

    it("counts tokens for a typical CLAUDE.md section", async () => {
      const content = `## Commands
\`\`\`
npm run dev         # Start dev server
npm test            # Run vitest
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
\`\`\``;
      const tokens = await countTokens(content);
      expect(tokens).toBeGreaterThan(20);
      expect(tokens).toBeLessThan(200);
    });
  });
});
