import type { LintRule, LintContext, LintResult } from "../types.js";

const VAGUE_PATTERNS = [
  { pattern: /follow\s+best\s+practices/i, fix: "Specify which practices and patterns to use" },
  { pattern: /write\s+clean\s+code/i, fix: "Define what 'clean' means in this project" },
  { pattern: /use\s+proper\s+(error\s+)?handling/i, fix: "Show the actual error handling pattern used" },
  { pattern: /keep\s+it\s+simple/i, fix: "Define complexity thresholds or patterns to avoid" },
  { pattern: /follow\s+conventions/i, fix: "List the specific conventions" },
  { pattern: /be\s+consistent/i, fix: "Point to example files showing the desired pattern" },
  { pattern: /ensure\s+quality/i, fix: "Define specific quality criteria (test coverage, etc.)" },
  { pattern: /maintain\s+readability/i, fix: "Show an example of the preferred code style" },
  { pattern: /use\s+appropriate\s+naming/i, fix: "List naming conventions with examples" },
  { pattern: /handle\s+edge\s+cases/i, fix: "List the specific edge cases to handle" },
];

export const vagueRule: LintRule = {
  id: "vague",
  severity: "warning",
  description: "Instructions too vague to be actionable",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    for (const { pattern, fix } of VAGUE_PATTERNS) {
      const match = ctx.content.match(pattern);
      if (match) {
        const lineNum = ctx.content.substring(0, ctx.content.indexOf(match[0])).split("\n").length;
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `"${match[0].trim()}" is too vague to be actionable for Claude.`,
          line: lineNum,
          fix,
        });
      }
    }
    return results;
  },
};
