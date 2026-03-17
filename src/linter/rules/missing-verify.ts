import type { LintRule, LintContext, LintResult } from "../types.js";

export const missingVerifyRule: LintRule = {
  id: "missing-verify",
  severity: "error",
  description: "Must include test/lint/typecheck commands",
  run(ctx: LintContext): LintResult[] {
    const hasVerification =
      /\b(test|spec|lint|typecheck|tsc|rubocop|eslint|rspec|pytest|vitest|jest|cargo\s+test|go\s+test|mix\s+test|phpunit|phpstan|mypy|ruff)\b/i.test(ctx.content);
    if (!hasVerification) {
      return [{
        ruleId: this.id,
        severity: "error",
        message: "No verification commands found. Claude can't confirm its work without test/lint/typecheck commands.",
        fix: "Add a '## Commands' section with test, lint, and typecheck commands.",
      }];
    }
    return [];
  },
};
