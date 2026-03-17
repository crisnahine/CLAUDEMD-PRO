import type { LintRule, LintContext, LintResult } from "../types.js";

export const noImportsRule: LintRule = {
  id: "no-imports",
  severity: "suggestion",
  description: "Large projects should use @import structure",
  run(ctx: LintContext): LintResult[] {
    const hasImports = /@import\s/.test(ctx.content);
    if (!hasImports && ctx.estimatedTokens > 2000) {
      return [{
        ruleId: this.id,
        severity: "suggestion",
        message: "Large CLAUDE.md without @import structure. Subdirectory CLAUDE.md files keep context focused.",
        fix: "Run `claudemd generate --modular` to generate an @import structure.",
      }];
    }
    return [];
  },
};
