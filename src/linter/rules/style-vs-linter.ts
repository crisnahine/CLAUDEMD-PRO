import type { LintRule, LintContext, LintResult } from "../types.js";

const STYLE_PATTERNS = [
  /prefer\s+(single|double)\s+quotes/i,
  /use\s+(2|4)\s+space(s)?\s+indent/i,
  /semicolons?\s+(always|never)/i,
  /trailing\s+comma/i,
  /max\s+line\s+length/i,
  /use\s+camelCase/i,
  /tabs?\s+vs\.?\s+spaces?/i,
  /\bPEP\s*8\b/i,
  /\bairbnb\s+style/i,
  /\bstandard\s+style/i,
  /\bprettier\s+config/i,
  /line\s+endings?\s+(lf|crlf)/i,
  /bracket\s+(same|next)\s+line/i,
];

export const styleVsLinterRule: LintRule = {
  id: "style-vs-linter",
  severity: "warning",
  description: "Style/formatting rules should use linter configs, not CLAUDE.md",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    for (const pattern of STYLE_PATTERNS) {
      const match = ctx.content.match(pattern);
      if (match) {
        const lineNum = ctx.content.substring(0, ctx.content.indexOf(match[0])).split("\n").length;
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `"${match[0].trim()}" is a formatting rule. Use a linter/formatter instead — saves tokens and enforces deterministically.`,
          line: lineNum,
          fix: "Move this to your linter config and add a lint command to CLAUDE.md instead.",
        });
      }
    }
    return results;
  },
};
