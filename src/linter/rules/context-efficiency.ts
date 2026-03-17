import type { LintRule, LintContext, LintResult } from "../types.js";

export const contextEfficiencyRule: LintRule = {
  id: "context-efficiency",
  severity: "suggestion",
  description: "Detects content that could be compressed without losing meaning",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];

    // Detect overly verbose command descriptions
    for (const section of ctx.sections) {
      const heading = section.heading.toLowerCase();

      // Check for command sections with redundant descriptions
      if (heading.includes("command")) {
        const longDescriptions = section.content.match(/^.{100,}$/gm);
        if (longDescriptions && longDescriptions.length > 2) {
          results.push({
            ruleId: this.id,
            severity: "suggestion",
            message: `Section "${section.heading}" has verbose command descriptions. Use a compact table format with inline comments.`,
            line: section.line,
            fix: "Use `command  # description` format instead of multi-line explanations.",
          });
        }
      }

      // Detect prose-heavy sections (few markdown structures, lots of plain text)
      const lineCount = section.content.split("\n").filter((l) => l.trim()).length;
      const bulletCount = (section.content.match(/^\s*[-*]\s/gm) ?? []).length;
      const codeBlockCount = (section.content.match(/```/g) ?? []).length / 2;

      if (lineCount > 10 && bulletCount === 0 && codeBlockCount === 0) {
        results.push({
          ruleId: this.id,
          severity: "suggestion",
          message: `Section "${section.heading}" is prose-heavy. Bullet points and code blocks are more token-efficient and scannable.`,
          line: section.line,
          fix: "Convert prose to bullet points or structured markdown.",
        });
      }
    }

    return results;
  },
};
