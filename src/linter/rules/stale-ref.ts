import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { LintRule, LintContext, LintResult } from "../types.js";

export const staleRefRule: LintRule = {
  id: "stale-ref",
  severity: "error",
  description: "References to non-existent paths",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    const pathPattern = /(?:^|\s)(\/[a-zA-Z][a-zA-Z0-9_\-./]+\/?)(?:\s|$|`)/gm;
    let match;

    while ((match = pathPattern.exec(ctx.content)) !== null) {
      const refPath = match[1].replace(/[`\s]/g, "");
      if (
        refPath.startsWith("/src/") ||
        refPath.startsWith("/app/") ||
        refPath.startsWith("/lib/") ||
        refPath.startsWith("/config/") ||
        refPath.startsWith("/test/") ||
        refPath.startsWith("/tests/") ||
        refPath.startsWith("/spec/") ||
        refPath.startsWith("/packages/") ||
        refPath.startsWith("/prisma/") ||
        refPath.startsWith("/db/")
      ) {
        const fsPath = resolve(ctx.rootDir, refPath.slice(1));
        if (!existsSync(fsPath)) {
          const lineNum = ctx.content.substring(0, match.index).split("\n").length;
          results.push({
            ruleId: this.id,
            severity: "error",
            message: `References \`${refPath}\` — file/directory does not exist.`,
            line: lineNum,
            fix: "Verify the correct path and update, or remove the reference.",
          });
        }
      }
    }
    return results;
  },
};
