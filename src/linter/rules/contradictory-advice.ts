import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { LintRule, LintContext, LintResult } from "../types.js";

function readPkgJson(rootDir: string): Record<string, unknown> | null {
  const pkgPath = resolve(rootDir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }
}

function hasDep(pkg: Record<string, unknown>, name: string): boolean {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  return name in deps || name in devDeps;
}

function getTopLevelExtensions(rootDir: string): Set<string> {
  const srcDir = resolve(rootDir, "src");
  const extensions = new Set<string>();

  if (!existsSync(srcDir)) return extensions;

  try {
    const entries = readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const dotIndex = entry.name.lastIndexOf(".");
        if (dotIndex > 0) {
          extensions.add(entry.name.slice(dotIndex));
        }
      }
    }
  } catch {
    // ignore errors
  }

  return extensions;
}

export const contradictoryAdviceRule: LintRule = {
  id: "contradictory-advice",
  severity: "warning",
  description: "Detects contradictions between CLAUDE.md content and project reality",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    const pkg = readPkgJson(ctx.rootDir);
    const contentLower = ctx.content.toLowerCase();

    // Check: says "use TypeScript" but only .js files in src/
    if (/\buse\s+typescript\b/i.test(ctx.content) || /\btypescript\b/i.test(ctx.content)) {
      const extensions = getTopLevelExtensions(ctx.rootDir);
      if (extensions.size > 0) {
        const hasTs = extensions.has(".ts") || extensions.has(".tsx");
        const hasJs = extensions.has(".js") || extensions.has(".jsx");
        if (!hasTs && hasJs) {
          results.push({
            ruleId: this.id,
            severity: "warning",
            message: "CLAUDE.md references TypeScript but only .js files found in src/.",
            fix: "Update CLAUDE.md to reflect the actual language, or add TypeScript to the project.",
          });
        }
      }
    }

    // Check: test framework contradictions
    if (pkg) {
      const testFrameworkPairs: [string, string, string][] = [
        // [mentioned pattern, conflicting dep, description]
        ["jest", "vitest", "Says prefer Jest but vitest is installed"],
        ["vitest", "jest", "Says prefer vitest but jest is installed"],
        ["mocha", "jest", "Says prefer Mocha but jest is installed"],
        ["mocha", "vitest", "Says prefer Mocha but vitest is installed"],
        ["jest", "mocha", "Says prefer Jest but mocha is installed"],
        ["vitest", "mocha", "Says prefer vitest but mocha is installed"],
      ];

      for (const [mentioned, conflicting, desc] of testFrameworkPairs) {
        const mentionPattern = new RegExp(`\\bprefer\\s+${mentioned}\\b`, "i");
        if (mentionPattern.test(ctx.content) && hasDep(pkg, conflicting) && !hasDep(pkg, mentioned)) {
          results.push({
            ruleId: this.id,
            severity: "warning",
            message: `${desc} in package.json dependencies.`,
            fix: `Update CLAUDE.md to reference the actual test framework (${conflicting}), or install ${mentioned}.`,
          });
        }
      }
    }

    // Check: says "use X" but X is not in dependencies
    if (pkg) {
      const usePattern = /\buse\s+([a-zA-Z][a-zA-Z0-9_.-]+)\b/gi;
      let match;

      // Known npm packages worth checking
      const knownPackages = new Set([
        "axios", "lodash", "moment", "dayjs", "prisma", "drizzle",
        "sequelize", "mongoose", "typeorm", "knex", "zod", "yup",
        "joi", "tailwindcss", "styled-components", "emotion",
        "redux", "zustand", "jotai", "recoil", "mobx",
        "webpack", "vite", "esbuild", "rollup", "parcel",
        "express", "fastify", "koa", "hapi", "nestjs",
        "pino", "winston", "bunyan",
      ]);

      while ((match = usePattern.exec(ctx.content)) !== null) {
        const depName = match[1].toLowerCase();
        if (knownPackages.has(depName) && !hasDep(pkg, depName)) {
          const lineNum = ctx.content.substring(0, match.index).split("\n").length;
          results.push({
            ruleId: this.id,
            severity: "warning",
            message: `CLAUDE.md says "use ${match[1]}" but it is not found in package.json dependencies.`,
            line: lineNum,
            fix: `Install ${match[1]} or remove the reference from CLAUDE.md.`,
          });
        }
      }
    }

    return results;
  },
};
