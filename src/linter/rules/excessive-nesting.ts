import type { LintRule, LintContext, LintResult } from "../types.js";

export const excessiveNestingRule: LintRule = {
  id: "excessive-nesting",
  severity: "suggestion",
  description: "Deep heading nesting can confuse AI context parsing",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    for (let i = 0; i < ctx.lines.length; i++) {
      const line = ctx.lines[i];
      if (/^#{4,}\s/.test(line)) {
        const level = line.match(/^(#+)/)?.[1].length ?? 4;
        results.push({
          ruleId: this.id,
          severity: "suggestion",
          message: `Heading level ${level} ('${"#".repeat(level)}') is deeply nested — AI models parse flat structures more reliably.`,
          line: i + 1,
          fix: "Consider flattening '####' headings into bullet points under a '##' section",
        });
      }
    }
    return results;
  },
};
