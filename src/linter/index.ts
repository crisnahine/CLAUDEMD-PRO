/**
 * Linter Engine
 *
 * Modular rule runner and effectiveness scoring engine.
 * Rules are loaded from /rules/ and can be filtered by presets.
 */

import type {
  LintRule,
  LintResult,
  LintContext,
  Section,
  ScoreBreakdown,
  Severity,
} from "./types.js";
import { countTokens } from "../token/index.js";
import { tokenBudgetRule } from "./rules/token-budget.js";
import { tokenBloatRule } from "./rules/token-bloat.js";
import { missingVerifyRule } from "./rules/missing-verify.js";
import { staleRefRule } from "./rules/stale-ref.js";
import { styleVsLinterRule } from "./rules/style-vs-linter.js";
import { vagueRule } from "./rules/vague.js";
import { redundantRule } from "./rules/redundant.js";
import { noArchitectureRule } from "./rules/no-architecture.js";
import { missingGotchasRule } from "./rules/missing-gotchas.js";
import { noImportsRule } from "./rules/no-imports.js";
import { missingPatternsRule } from "./rules/missing-patterns.js";
import { importCandidateRule } from "./rules/import-candidate.js";
import { contextEfficiencyRule } from "./rules/context-efficiency.js";
import { duplicateContentRule } from "./rules/duplicate-content.js";
import { commandsRunnableRule } from "./rules/commands-runnable.js";
import { frameworkVersionSyncRule } from "./rules/framework-version-sync.js";
import { depthImbalanceRule } from "./rules/depth-imbalance.js";
import { contradictoryAdviceRule } from "./rules/contradictory-advice.js";

// ─── All available rules ────────────────────────────────────

export const ALL_RULES: LintRule[] = [
  tokenBudgetRule,
  tokenBloatRule,
  missingVerifyRule,
  staleRefRule,
  styleVsLinterRule,
  vagueRule,
  redundantRule,
  noArchitectureRule,
  missingGotchasRule,
  noImportsRule,
  missingPatternsRule,
  importCandidateRule,
  contextEfficiencyRule,
  duplicateContentRule,
  commandsRunnableRule,
  frameworkVersionSyncRule,
  depthImbalanceRule,
  contradictoryAdviceRule,
];

// ─── Rule Runner ────────────────────────────────────────────

export interface RunOptions {
  /** Only run these rule IDs (default: all) */
  rules?: string[];
  /** Override severity for specific rules */
  overrides?: Record<string, Severity | "off">;
}

export function buildContext(
  content: string,
  rootDir: string,
  stackLanguage?: string,
  stackFramework?: string
): LintContext {
  return {
    content,
    lines: content.split("\n"),
    rootDir,
    sections: parseSections(content),
    estimatedTokens: Math.ceil(content.length / 4),
    stackLanguage,
    stackFramework,
  };
}

/** Async variant that uses tiktoken for accurate token count */
export async function buildContextAsync(
  content: string,
  rootDir: string,
  stackLanguage?: string,
  stackFramework?: string
): Promise<LintContext> {
  const tokens = await countTokens(content);
  return {
    content,
    lines: content.split("\n"),
    rootDir,
    sections: parseSections(content),
    estimatedTokens: tokens,
    stackLanguage,
    stackFramework,
  };
}

export function runRules(ctx: LintContext, opts?: RunOptions): LintResult[] {
  const results: LintResult[] = [];
  const overrides = opts?.overrides ?? {};
  const ruleFilter = opts?.rules ? new Set(opts.rules) : null;

  for (const rule of ALL_RULES) {
    if (ruleFilter && !ruleFilter.has(rule.id)) continue;
    if (overrides[rule.id] === "off") continue;

    const ruleResults = rule.run(ctx);

    // Apply severity overrides
    const overrideSeverity = overrides[rule.id];
    if (overrideSeverity && overrideSeverity !== "off") {
      for (const r of ruleResults) {
        r.severity = overrideSeverity;
      }
    }

    results.push(...ruleResults);
  }

  return results;
}

// ─── Scoring Engine ─────────────────────────────────────────

export function calculateScore(
  content: string,
  results: LintResult[],
  accurateTokens?: number
): ScoreBreakdown {
  const tokens = accurateTokens ?? Math.ceil(content.length / 4);

  // Token Efficiency: optimal range is 500-3000 tokens
  let tokenEfficiency = 100;
  if (tokens < 100) tokenEfficiency = 30;
  else if (tokens < 300) tokenEfficiency = 60;
  else if (tokens > 4000) tokenEfficiency = Math.max(20, 100 - (tokens - 3000) / 50);
  else if (tokens > 3000) tokenEfficiency = Math.max(50, 100 - (tokens - 3000) / 30);

  const bloatResults = results.filter((r) => r.ruleId === "token-bloat");
  tokenEfficiency -= bloatResults.length * 10;

  // Actionability — vague instructions and verbosity reduce this
  // (each rule penalizes ONLY its primary dimension to avoid double-counting)
  let actionability = 80;
  const vagueCount = results.filter((r) => r.ruleId === "vague").length;
  actionability -= vagueCount * 15;
  const efficiencyCount = results.filter((r) => r.ruleId === "context-efficiency").length;
  actionability -= efficiencyCount * 5;

  // Coverage — missing sections reduce this
  let coverage = 100;
  if (results.some((r) => r.ruleId === "no-architecture")) coverage -= 20;
  if (results.some((r) => r.ruleId === "missing-gotchas")) coverage -= 15;
  if (results.some((r) => r.ruleId === "missing-verify")) coverage -= 20;
  if (results.some((r) => r.ruleId === "missing-patterns")) coverage -= 10;
  const sectionCount = (content.match(/^##\s/gm) ?? []).length;
  if (sectionCount < 3) coverage -= 20;

  // Specificity — style-over-substance and redundancy reduce this
  let specificity = 90;
  const styleIssues = results.filter((r) => r.ruleId === "style-vs-linter").length;
  specificity -= styleIssues * 10;
  const redundantCount = results.filter((r) => r.ruleId === "redundant").length;
  specificity -= redundantCount * 10;

  // Freshness — stale references
  let freshness = 100;
  const staleRefs = results.filter((r) => r.ruleId === "stale-ref").length;
  freshness -= staleRefs * 20;

  // Anti-Pattern Free — structural anti-patterns
  let antiPatternFree = 100;
  const duplicates = results.filter((r) => r.ruleId === "duplicate-content").length;
  antiPatternFree -= duplicates * 15;
  const budgetErrors = results.filter((r) => r.ruleId === "token-budget").length;
  antiPatternFree -= budgetErrors * 20;
  const noImports = results.filter((r) => r.ruleId === "no-imports").length;
  antiPatternFree -= noImports * 10;
  const importCandidates = results.filter((r) => r.ruleId === "import-candidate").length;
  antiPatternFree -= importCandidates * 5;

  return {
    tokenEfficiency: clamp(tokenEfficiency),
    actionability: clamp(actionability),
    coverage: clamp(coverage),
    specificity: clamp(specificity),
    freshness: clamp(freshness),
    antiPatternFree: clamp(antiPatternFree),
  };
}

/** Dimension weights — more objective metrics weigh slightly more */
const DIMENSION_WEIGHTS = {
  tokenEfficiency: 1.2,
  actionability: 1.0,
  coverage: 0.8,
  specificity: 0.9,
  freshness: 1.2,
  antiPatternFree: 0.9,
} as const;

const TOTAL_WEIGHT = Object.values(DIMENSION_WEIGHTS).reduce((s, w) => s + w, 0);

export function totalScore(breakdown: ScoreBreakdown): number {
  const weighted =
    breakdown.tokenEfficiency * DIMENSION_WEIGHTS.tokenEfficiency +
    breakdown.actionability * DIMENSION_WEIGHTS.actionability +
    breakdown.coverage * DIMENSION_WEIGHTS.coverage +
    breakdown.specificity * DIMENSION_WEIGHTS.specificity +
    breakdown.freshness * DIMENSION_WEIGHTS.freshness +
    breakdown.antiPatternFree * DIMENSION_WEIGHTS.antiPatternFree;

  return Math.round(weighted / TOTAL_WEIGHT);
}

// ─── Helpers ────────────────────────────────────────────────

function parseSections(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentContent = "";
  let currentLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      if (currentHeading) {
        sections.push({ heading: currentHeading, content: currentContent, line: currentLine });
      }
      currentHeading = line.replace("## ", "").trim();
      currentContent = "";
      currentLine = i + 1;
    } else {
      currentContent += line + "\n";
    }
  }

  if (currentHeading) {
    sections.push({ heading: currentHeading, content: currentContent, line: currentLine });
  }

  return sections;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

// Re-export types and DIMENSION_WEIGHTS for testing
export { DIMENSION_WEIGHTS };
export type { LintRule, LintResult, LintContext, Section, ScoreBreakdown, Severity } from "./types.js";
