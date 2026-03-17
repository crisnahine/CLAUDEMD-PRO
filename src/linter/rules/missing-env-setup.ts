import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { LintRule, LintContext, LintResult } from "../types.js";

export const missingEnvSetupRule: LintRule = {
  id: "missing-env-setup",
  severity: "suggestion",
  description: "Projects with .env files should document environment setup",
  run(ctx: LintContext): LintResult[] {
    const hasEnvFile =
      existsSync(resolve(ctx.rootDir, ".env.example")) ||
      existsSync(resolve(ctx.rootDir, ".env"));
    if (!hasEnvFile) return [];

    const hasEnvSection = ctx.sections.some((s) =>
      /environment|env\s*var|setup|configuration/i.test(s.heading)
    );
    const mentionsEnv = /\.env\b/i.test(ctx.content);

    if (!hasEnvSection && !mentionsEnv) {
      return [{
        ruleId: this.id,
        severity: "suggestion",
        message: "Project has .env files but CLAUDE.md does not document environment setup.",
        fix: "Add environment variable documentation to CLAUDE.md",
      }];
    }
    return [];
  },
};
