import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { LintRule, LintContext, LintResult } from "../types.js";

const DB_INDICATORS = [
  "prisma/schema.prisma",
  "db/schema.rb",
  "migrations",
  "alembic",
  "database/migrations",
];

export const missingDbContextRule: LintRule = {
  id: "missing-db-context",
  severity: "suggestion",
  description: "Projects with databases should document the data model",
  run(ctx: LintContext): LintResult[] {
    const hasDbIndicator = DB_INDICATORS.some((indicator) =>
      existsSync(resolve(ctx.rootDir, indicator))
    );
    if (!hasDbIndicator) return [];

    const hasDbSection = ctx.sections.some((s) =>
      /database|data\s*model|schema|orm/i.test(s.heading)
    );
    const mentionsDb = /database|data\s*model|schema|orm/i.test(ctx.content);

    if (!hasDbSection && !mentionsDb) {
      return [{
        ruleId: this.id,
        severity: "suggestion",
        message: "Project has database artifacts but CLAUDE.md does not document the data model.",
        fix: "Add database context (ORM, adapter, key models) to CLAUDE.md",
      }];
    }
    return [];
  },
};
