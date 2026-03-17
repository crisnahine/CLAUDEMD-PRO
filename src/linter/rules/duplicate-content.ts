import type { LintRule, LintContext, LintResult } from "../types.js";

export const duplicateContentRule: LintRule = {
  id: "duplicate-content",
  severity: "warning",
  description: "Detects repeated content across sections",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    const seenPhrases = new Map<string, { heading: string; line: number }>();

    for (const section of ctx.sections) {
      // Extract significant lines (non-empty, non-heading, >20 chars)
      const lines = section.content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 20 && !l.startsWith("#") && !l.startsWith("```"));

      for (const line of lines) {
        const normalized = line.toLowerCase().replace(/\s+/g, " ");
        const existing = seenPhrases.get(normalized);
        if (existing && existing.heading !== section.heading) {
          results.push({
            ruleId: this.id,
            severity: "warning",
            message: `Duplicated content between "${existing.heading}" and "${section.heading}": "${line.slice(0, 60)}..."`,
            line: section.line,
            fix: "Remove the duplicate and keep it in the most relevant section.",
          });
          break; // One duplicate per section pair is enough
        }
        seenPhrases.set(normalized, { heading: section.heading, line: section.line });
      }
    }

    return results;
  },
};
