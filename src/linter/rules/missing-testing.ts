import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { LintRule, LintContext, LintResult } from "../types.js";

const TEST_DIRS = ["test", "tests", "spec", "__tests__"];

export const missingTestingRule: LintRule = {
  id: "missing-testing",
  severity: "warning",
  description: "Projects with test frameworks should document testing in CLAUDE.md",
  run(ctx: LintContext): LintResult[] {
    const hasTestDir = TEST_DIRS.some((dir) =>
      existsSync(resolve(ctx.rootDir, dir))
    );
    if (!hasTestDir) return [];

    const hasTestingSection = ctx.sections.some((s) => /test/i.test(s.heading));
    const mentionsTestInContent = /\btest/i.test(ctx.content);

    if (!hasTestingSection && !mentionsTestInContent) {
      return [{
        ruleId: this.id,
        severity: "warning",
        message: "Project has test directories but CLAUDE.md does not document testing.",
        fix: "Add a '## Testing' section documenting the test framework and how to run tests",
      }];
    }
    return [];
  },
};
