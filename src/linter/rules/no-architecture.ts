import type { LintRule, LintContext, LintResult } from "../types.js";

export const noArchitectureRule: LintRule = {
  id: "no-architecture",
  severity: "warning",
  description: "Missing architecture/project structure section",
  run(ctx: LintContext): LintResult[] {
    const hasArchSection =
      /##\s*(architecture|project\s+structure|file\s+structure|directory|codebase\s+layout)/i.test(ctx.content);
    if (!hasArchSection) {
      return [{
        ruleId: this.id,
        severity: "warning",
        message: "No architecture/structure section found. Claude navigates better with a project map.",
        fix: "Add a '## Architecture' section listing key directories and their purposes.",
      }];
    }
    return [];
  },
};
