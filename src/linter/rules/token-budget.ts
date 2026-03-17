import type { LintRule, LintContext, LintResult } from "../types.js";

export const tokenBudgetRule: LintRule = {
  id: "token-budget",
  severity: "error",
  description: "Root CLAUDE.md should be under ~3000 tokens",
  run(ctx: LintContext): LintResult[] {
    const tokens = ctx.estimatedTokens;
    if (tokens > 4000) {
      return [{
        ruleId: this.id,
        severity: "error",
        message: `CLAUDE.md is ~${tokens} tokens. Recommended max is ~3000 for root file. Every token here is loaded in EVERY session.`,
        fix: "Split into root CLAUDE.md + @import child files for subdirectories.",
      }];
    }
    if (tokens > 3000) {
      return [{
        ruleId: this.id,
        severity: "warning",
        message: `CLAUDE.md is ~${tokens} tokens. Approaching the ~3000 recommended limit.`,
        fix: "Consider moving verbose sections to @import child files.",
      }];
    }
    return [];
  },
};
