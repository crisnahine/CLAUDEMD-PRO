/**
 * Compare Command
 *
 * Before/after scoring comparison of two CLAUDE.md files.
 * Shows exactly what improved and what regressed.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { buildContext, runRules, calculateScore, totalScore } from "../linter/index.js";
import type { ScoreBreakdown } from "../linter/types.js";

interface CompareOptions {
  format?: string;
}

export async function compareCommand(
  fileA: string,
  fileB: string,
  opts: CompareOptions
): Promise<void> {
  const pathA = resolve(process.cwd(), fileA);
  const pathB = resolve(process.cwd(), fileB);

  if (!existsSync(pathA)) {
    console.error(chalk.red(`✖ File not found: ${pathA}`));
    process.exit(1);
  }
  if (!existsSync(pathB)) {
    console.error(chalk.red(`✖ File not found: ${pathB}`));
    process.exit(1);
  }

  const contentA = readFileSync(pathA, "utf-8");
  const contentB = readFileSync(pathB, "utf-8");
  const rootDir = process.cwd();

  // Score both
  const ctxA = buildContext(contentA, rootDir);
  const ctxB = buildContext(contentB, rootDir);
  const resultsA = runRules(ctxA);
  const resultsB = runRules(ctxB);
  const scoreA = calculateScore(contentA, resultsA);
  const scoreB = calculateScore(contentB, resultsB);
  const totalA = totalScore(scoreA);
  const totalB = totalScore(scoreB);
  const diff = totalB - totalA;

  if (opts.format === "json") {
    console.log(JSON.stringify({
      before: { score: totalA, breakdown: scoreA, issues: resultsA.length },
      after: { score: totalB, breakdown: scoreB, issues: resultsB.length },
      diff,
      improved: diff > 0,
    }, null, 2));
    return;
  }

  // Visual output
  console.log("");
  console.log(chalk.bold("╔══════════════════════════════════════════════════════╗"));
  console.log(chalk.bold("║          CLAUDE.md Before / After Comparison         ║"));
  console.log(chalk.bold("╠══════════════════════════════════════════════════════╣"));
  console.log(`║                                                      ║`);
  console.log(`║  Before: ${colorScore(totalA)}/100   →   After: ${colorScore(totalB)}/100   ${formatDiff(diff)}${" ".repeat(Math.max(0, 8 - formatDiffLen(diff)))}║`);
  console.log(`║                                                      ║`);
  console.log(chalk.bold("╠══════════════════════════════════════════════════════╣"));

  // Dimension comparison
  const dimensions: Array<[keyof ScoreBreakdown, string]> = [
    ["tokenEfficiency", "Token Efficiency"],
    ["actionability", "Actionability"],
    ["coverage", "Coverage"],
    ["specificity", "Specificity"],
    ["freshness", "Freshness"],
    ["antiPatternFree", "Anti-Pattern Free"],
  ];

  for (const [key, label] of dimensions) {
    const a = scoreA[key];
    const b = scoreB[key];
    const d = b - a;
    const padded = label.padEnd(20);
    const arrow = d > 0 ? chalk.green(`+${d}`) : d < 0 ? chalk.red(`${d}`) : chalk.dim("=0");
    console.log(`║  ${padded} ${String(a).padStart(3)} → ${String(b).padStart(3)}  ${arrow}${" ".repeat(Math.max(0, 14 - arrow.length + 10))}║`);
  }

  console.log(`║                                                      ║`);
  console.log(chalk.bold("╠══════════════════════════════════════════════════════╣"));

  // Issue counts
  const errorsA = resultsA.filter((r) => r.severity === "error").length;
  const errorsB = resultsB.filter((r) => r.severity === "error").length;
  const warningsA = resultsA.filter((r) => r.severity === "warning").length;
  const warningsB = resultsB.filter((r) => r.severity === "warning").length;

  console.log(`║  Errors:    ${errorsA} → ${errorsB}   Warnings: ${warningsA} → ${warningsB}${" ".repeat(Math.max(0, 18 - `${errorsA}${errorsB}${warningsA}${warningsB}`.length))}║`);
  console.log(`║  Tokens:    ~${Math.ceil(contentA.length / 4)} → ~${Math.ceil(contentB.length / 4)}${" ".repeat(Math.max(0, 33 - `${Math.ceil(contentA.length / 4)}${Math.ceil(contentB.length / 4)}`.length))}║`);
  console.log(chalk.bold("╚══════════════════════════════════════════════════════╝"));

  // New/resolved issues
  const newIssueIds = new Set(resultsB.map((r) => r.ruleId));
  const oldIssueIds = new Set(resultsA.map((r) => r.ruleId));

  const resolved = resultsA.filter((r) => !newIssueIds.has(r.ruleId));
  const introduced = resultsB.filter((r) => !oldIssueIds.has(r.ruleId));

  if (resolved.length > 0) {
    console.log(chalk.green.bold("\nResolved:"));
    for (const r of resolved) {
      console.log(chalk.green(`  ✓ [${r.ruleId}] ${r.message}`));
    }
  }

  if (introduced.length > 0) {
    console.log(chalk.red.bold("\nNew issues:"));
    for (const r of introduced) {
      console.log(chalk.red(`  ✖ [${r.ruleId}] ${r.message}`));
    }
  }

  if (diff > 0) {
    console.log(chalk.green.bold(`\n↑ Score improved by ${diff} points`));
  } else if (diff < 0) {
    console.log(chalk.red.bold(`\n↓ Score decreased by ${Math.abs(diff)} points`));
  } else {
    console.log(chalk.dim("\n= No change in overall score"));
  }

  console.log("");
}

function colorScore(score: number): string {
  if (score >= 80) return chalk.green.bold(score.toString());
  if (score >= 50) return chalk.yellow.bold(score.toString());
  return chalk.red.bold(score.toString());
}

function formatDiff(diff: number): string {
  if (diff > 0) return chalk.green.bold(`(+${diff})`);
  if (diff < 0) return chalk.red.bold(`(${diff})`);
  return chalk.dim("(±0)");
}

function formatDiffLen(diff: number): number {
  return `(${diff > 0 ? "+" : ""}${diff})`.length;
}
