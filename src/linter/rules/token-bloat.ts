import type { LintRule, LintContext, LintResult } from "../types.js";

export const tokenBloatRule: LintRule = {
  id: "token-bloat",
  severity: "warning",
  description: "Single section should not dominate the token budget",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    for (const section of ctx.sections) {
      const sectionTokens = Math.ceil(section.content.length / 4);
      const pct = Math.round((sectionTokens / Math.max(ctx.estimatedTokens, 1)) * 100);
      if (pct > 25 && sectionTokens > 400) {
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `Section "${section.heading}" is ${sectionTokens} tokens (${pct}% of total). Consider trimming or moving to @import.`,
          line: section.line,
        });
      }
    }
    return results;
  },
};
