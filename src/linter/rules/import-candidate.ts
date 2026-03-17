import type { LintRule, LintContext, LintResult } from "../types.js";

export const importCandidateRule: LintRule = {
  id: "import-candidate",
  severity: "suggestion",
  description: "Identifies sections that could be moved to child CLAUDE.md via @import",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];

    if (ctx.estimatedTokens < 1500) return [];

    for (const section of ctx.sections) {
      const sectionTokens = Math.ceil(section.content.length / 4);
      // Sections over 500 tokens that mention specific directories
      if (sectionTokens > 500) {
        const dirMentions = section.content.match(/\/(src|app|lib|packages|modules)\//g);
        if (dirMentions && dirMentions.length >= 2) {
          results.push({
            ruleId: this.id,
            severity: "suggestion",
            message: `Section "${section.heading}" (${sectionTokens} tokens) references multiple directories. Consider splitting into per-directory CLAUDE.md files with @import.`,
            line: section.line,
            fix: "Move directory-specific content to child CLAUDE.md files and @import them.",
          });
        }
      }
    }
    return results;
  },
};
