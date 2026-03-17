import type { LintRule, LintContext, LintResult } from "../types.js";

export const missingGotchasRule: LintRule = {
  id: "missing-gotchas",
  severity: "suggestion",
  description: "Missing gotchas/pitfalls section",
  run(ctx: LintContext): LintResult[] {
    const hasGotchas = /##\s*(gotchas|don'?t|avoid|pitfalls|warnings|common\s+mistakes)/i.test(ctx.content);
    if (!hasGotchas) {
      return [{
        ruleId: this.id,
        severity: "suggestion",
        message: "No gotchas/pitfalls section. This prevents Claude from making known mistakes.",
        fix: "Add a '## Gotchas' section with DON'T rules for auto-generated files, common errors, etc.",
      }];
    }
    return [];
  },
};
