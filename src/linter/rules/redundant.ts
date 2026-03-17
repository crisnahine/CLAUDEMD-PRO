import type { LintRule, LintContext, LintResult } from "../types.js";

export const redundantRule: LintRule = {
  id: "redundant",
  severity: "warning",
  description: "Information Claude can infer from project files",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];

    if (ctx.stackLanguage === "typescript" && /use\s+typescript/i.test(ctx.content)) {
      results.push({
        ruleId: this.id,
        severity: "warning",
        message: '"Use TypeScript" — Claude can infer this from tsconfig.json. Remove to save tokens.',
        fix: "Remove this line.",
      });
    }

    if (ctx.stackLanguage === "python" && /use\s+python/i.test(ctx.content)) {
      results.push({
        ruleId: this.id,
        severity: "warning",
        message: '"Use Python" — Claude can infer this from pyproject.toml/requirements.txt.',
        fix: "Remove this line.",
      });
    }

    if (ctx.stackFramework === "rails" && /this\s+is\s+a\s+rails/i.test(ctx.content)) {
      results.push({
        ruleId: this.id,
        severity: "warning",
        message: '"This is a Rails..." — Claude can infer this from Gemfile. Remove to save tokens.',
        fix: "Remove this line.",
      });
    }

    // "Use ESM" when package.json has type: "module"
    if (/use\s+esm/i.test(ctx.content) && /type.*module/i.test(ctx.content)) {
      results.push({
        ruleId: this.id,
        severity: "warning",
        message: '"Use ESM" — Claude can see "type": "module" in package.json.',
        fix: "Remove this line.",
      });
    }

    return results;
  },
};
