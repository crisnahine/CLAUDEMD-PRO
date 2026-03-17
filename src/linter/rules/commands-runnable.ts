import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LintRule, LintContext, LintResult } from "../types.js";

export const commandsRunnableRule: LintRule = {
  id: "commands-runnable",
  severity: "warning",
  description: "Checks that referenced npm/yarn/pnpm scripts exist in package.json",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    const pkgPath = resolve(ctx.rootDir, "package.json");

    if (!existsSync(pkgPath)) return [];

    let scripts: Record<string, string> = {};
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      scripts = pkg.scripts ?? {};
    } catch {
      return [];
    }

    // Match patterns like: npm run test, yarn build, pnpm dev
    const cmdPattern = /\b(?:npm\s+run|yarn|pnpm)\s+([a-zA-Z0-9_:.-]+)/g;
    let match;

    while ((match = cmdPattern.exec(ctx.content)) !== null) {
      const scriptName = match[1];
      if (!(scriptName in scripts)) {
        const lineNum = ctx.content.substring(0, match.index).split("\n").length;
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `Script \`${scriptName}\` is referenced but not found in package.json scripts.`,
          line: lineNum,
          fix: `Add "${scriptName}" to package.json scripts or correct the command name.`,
        });
      }
    }

    return results;
  },
};
