import type { LintRule, LintContext, LintResult } from "../types.js";

const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/g,
  /\bFIXME\b/g,
  /\bXXX\b/g,
  /\bTBD\b/g,
  /\bPLACEHOLDER\b/gi,
  /<insert[^>]*>/gi,
  /\[fill\s+in\]/gi,
  /\{REPLACE[^}]*\}/gi,
  /\?\?\?/g,
];

export const unresolvedPlaceholdersRule: LintRule = {
  id: "unresolved-placeholders",
  severity: "warning",
  description: "CLAUDE.md should not contain unresolved placeholder text",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    for (const pattern of PLACEHOLDER_PATTERNS) {
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(ctx.content)) !== null) {
        const lineNum = ctx.content.substring(0, match.index).split("\n").length;
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `Unresolved placeholder '${match[0]}' found.`,
          line: lineNum,
          fix: `Resolve placeholder '${match[0]}' with actual project information`,
        });
      }
    }
    return results;
  },
};
