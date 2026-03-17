import type { LintRule, LintContext, LintResult } from "../types.js";

export const missingPatternsRule: LintRule = {
  id: "missing-patterns",
  severity: "suggestion",
  description: "Missing key patterns section for frameworks that use conventions",
  run(ctx: LintContext): LintResult[] {
    const hasPatterns = /##\s*(key\s+)?patterns/i.test(ctx.content);
    const conventionFrameworks = ["rails", "django", "laravel", "phoenix", "nextjs"];

    if (!hasPatterns && ctx.stackFramework && conventionFrameworks.includes(ctx.stackFramework)) {
      return [{
        ruleId: this.id,
        severity: "suggestion",
        message: `${ctx.stackFramework} is convention-heavy. A "Key Patterns" section helps Claude follow your project's specific conventions.`,
        fix: "Add a '## Key Patterns' section documenting your service objects, naming conventions, etc.",
      }];
    }
    return [];
  },
};
