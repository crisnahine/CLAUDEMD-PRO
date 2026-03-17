import type { LintRule, LintContext, LintResult } from "../types.js";

export const emptySectionRule: LintRule = {
  id: "empty-section",
  severity: "warning",
  description: "Sections should contain meaningful content",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    for (const section of ctx.sections) {
      const trimmed = section.content.trim();
      const nonWhitespace = trimmed.replace(/\s/g, "");
      if (trimmed === "" || nonWhitespace.length < 10) {
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `Section '${section.heading}' has no meaningful content.`,
          line: section.line,
          fix: `Add content to the '${section.heading}' section or remove it`,
        });
      }
    }
    return results;
  },
};
