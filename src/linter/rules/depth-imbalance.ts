import type { LintRule, LintContext, LintResult } from "../types.js";

export const depthImbalanceRule: LintRule = {
  id: "depth-imbalance",
  severity: "suggestion",
  description: "Flags sections with highly inconsistent depth",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];

    if (ctx.sections.length < 3) return [];

    const sectionLengths = ctx.sections.map((s) => ({
      heading: s.heading,
      line: s.line,
      lineCount: s.content.split("\n").filter((l) => l.trim()).length,
    }));

    const longest = Math.max(...sectionLengths.map((s) => s.lineCount));
    const shortest = Math.min(...sectionLengths.map((s) => s.lineCount));

    if (shortest >= 3 || longest < 30) return [];
    if (longest / Math.max(shortest, 1) <= 10) return [];

    const longSections = sectionLengths.filter((s) => s.lineCount >= 30);
    const shortSections = sectionLengths.filter((s) => s.lineCount < 3);

    for (const short of shortSections) {
      const longNames = longSections.map((s) => `"${s.heading}"`).join(", ");
      results.push({
        ruleId: this.id,
        severity: "suggestion",
        message: `Section "${short.heading}" has ${short.lineCount} lines while ${longNames} has 30+. Consider expanding sparse sections or splitting long ones.`,
        line: short.line,
        fix: "Balance section depth — expand thin sections with actionable details or split oversized sections into child CLAUDE.md files.",
      });
    }

    return results;
  },
};
