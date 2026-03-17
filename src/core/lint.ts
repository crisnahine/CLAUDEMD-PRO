/**
 * Core Lint Module
 *
 * Shared lint logic used by both the CLI lint command and the MCP server.
 * Wraps the linter engine into a simple input/output interface.
 */

import { buildContext, buildContextAsync, runRules, calculateScore, totalScore } from "../linter/index.js";
import type { RunOptions } from "../linter/index.js";
import type { LintResult, ScoreBreakdown } from "../linter/types.js";

export interface LintOutput {
  score: number;
  breakdown: ScoreBreakdown;
  results: LintResult[];
  summary: { errors: number; warnings: number; suggestions: number };
}

/**
 * Synchronous lint using chars/4 token estimation.
 */
export function lintContent(content: string, rootDir: string, opts?: RunOptions & { stackLanguage?: string; stackFramework?: string }): LintOutput {
  const ctx = buildContext(content, rootDir, opts?.stackLanguage, opts?.stackFramework);
  const results = runRules(ctx, opts);
  const breakdown = calculateScore(content, results);
  const score = totalScore(breakdown);
  return {
    score,
    breakdown,
    results,
    summary: {
      errors: results.filter(r => r.severity === "error").length,
      warnings: results.filter(r => r.severity === "warning").length,
      suggestions: results.filter(r => r.severity === "suggestion").length,
    },
  };
}

/**
 * Async lint using tiktoken for accurate token counting.
 */
export async function lintContentAsync(content: string, rootDir: string, opts?: RunOptions & { stackLanguage?: string; stackFramework?: string }): Promise<LintOutput> {
  const ctx = await buildContextAsync(content, rootDir, opts?.stackLanguage, opts?.stackFramework);
  const results = runRules(ctx, opts);
  const breakdown = calculateScore(content, results, ctx.estimatedTokens);
  const score = totalScore(breakdown);
  return {
    score,
    breakdown,
    results,
    summary: {
      errors: results.filter(r => r.severity === "error").length,
      warnings: results.filter(r => r.severity === "warning").length,
      suggestions: results.filter(r => r.severity === "suggestion").length,
    },
  };
}
