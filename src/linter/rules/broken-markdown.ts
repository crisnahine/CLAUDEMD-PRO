import type { LintRule, LintContext, LintResult } from "../types.js";

export const brokenMarkdownRule: LintRule = {
  id: "broken-markdown",
  severity: "error",
  description: "CLAUDE.md should have valid markdown structure",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];

    // Check for unclosed code blocks
    const fenceMatches = ctx.content.match(/^```/gm);
    if (fenceMatches && fenceMatches.length % 2 !== 0) {
      // Find the last unmatched fence
      let openCount = 0;
      let lastFenceLine = 0;
      for (let i = 0; i < ctx.lines.length; i++) {
        if (/^```/.test(ctx.lines[i])) {
          openCount++;
          lastFenceLine = i + 1;
        }
      }
      results.push({
        ruleId: this.id,
        severity: "error",
        message: "Unclosed code block detected — odd number of ``` fences.",
        line: lastFenceLine,
        fix: "Add a closing ``` to properly terminate the code block",
      });
    }

    // Check for headers with no space after #
    for (let i = 0; i < ctx.lines.length; i++) {
      const line = ctx.lines[i];
      if (/^#{1,6}[^\s#]/.test(line)) {
        results.push({
          ruleId: this.id,
          severity: "error",
          message: `Malformed heading — missing space after '#' in: "${line.substring(0, 40)}".`,
          line: i + 1,
          fix: "Add a space after the '#' characters to create a valid heading",
        });
      }
    }

    // Check for excessive consecutive blank lines (>3)
    let consecutiveBlanks = 0;
    for (let i = 0; i < ctx.lines.length; i++) {
      if (ctx.lines[i].trim() === "") {
        consecutiveBlanks++;
        if (consecutiveBlanks === 4) {
          results.push({
            ruleId: this.id,
            severity: "error",
            message: "Excessive blank lines (more than 3 consecutive).",
            line: i + 1,
            fix: "Reduce consecutive blank lines to 2 or fewer",
          });
        }
      } else {
        consecutiveBlanks = 0;
      }
    }

    return results;
  },
};
