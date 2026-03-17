import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { LintRule, LintContext, LintResult } from "../types.js";

type PkgManager = "pnpm" | "yarn" | "bun" | "npm";

interface PkgManagerPattern {
  pattern: RegExp;
  name: PkgManager;
}

const LOCK_FILES: { file: string; manager: PkgManager }[] = [
  { file: "pnpm-lock.yaml", manager: "pnpm" },
  { file: "yarn.lock", manager: "yarn" },
  { file: "bun.lockb", manager: "bun" },
];

const OTHER_MANAGER_PATTERNS: Record<PkgManager, PkgManagerPattern[]> = {
  pnpm: [
    { pattern: /\bnpm\s+run\b/g, name: "npm" },
    { pattern: /\byarn\s+(?:run\s+|add\s+|remove\s+|install\b)/g, name: "yarn" },
    { pattern: /\bbun\s+run\b/g, name: "bun" },
  ],
  yarn: [
    { pattern: /\bnpm\s+run\b/g, name: "npm" },
    { pattern: /\bpnpm\s+(?:run\s+|add\s+|remove\s+|install\b)/g, name: "pnpm" },
    { pattern: /\bbun\s+run\b/g, name: "bun" },
  ],
  bun: [
    { pattern: /\bnpm\s+run\b/g, name: "npm" },
    { pattern: /\byarn\s+(?:run\s+|add\s+|remove\s+|install\b)/g, name: "yarn" },
    { pattern: /\bpnpm\s+(?:run\s+|add\s+|remove\s+|install\b)/g, name: "pnpm" },
  ],
  npm: [
    { pattern: /\bpnpm\s+(?:run\s+|add\s+|remove\s+|install\b)/g, name: "pnpm" },
    { pattern: /\byarn\s+(?:run\s+|add\s+|remove\s+|install\b)/g, name: "yarn" },
    { pattern: /\bbun\s+run\b/g, name: "bun" },
  ],
};

function detectPkgManager(rootDir: string): PkgManager {
  for (const { file, manager } of LOCK_FILES) {
    if (existsSync(resolve(rootDir, file))) return manager;
  }
  return "npm";
}

export const inconsistentPkgManagerRule: LintRule = {
  id: "inconsistent-pkg-manager",
  severity: "warning",
  description: "Commands should use the project's actual package manager",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    const detected = detectPkgManager(ctx.rootDir);
    const patterns = OTHER_MANAGER_PATTERNS[detected];

    for (const { pattern, name } of patterns) {
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(ctx.content)) !== null) {
        const lineNum = ctx.content.substring(0, match.index).split("\n").length;
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `Found '${match[0].trim()}' but project uses ${detected} (detected from lock file).`,
          line: lineNum,
          fix: `Replace '${name}' with '${detected}' to match the project's package manager`,
        });
      }
    }
    return results;
  },
};
