/**
 * Lint Command
 *
 * Scores an existing CLAUDE.md on *effectiveness* — not just structure.
 * Uses the modular rule engine from /src/linter/.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { detectStack } from "../analyzers/stack-detector.js";
import { buildContextAsync, runRules, calculateScore, totalScore, type LintResult, type ScoreBreakdown } from "../linter/index.js";
import { loadConfig } from "../config/index.js";
import { defaultPreset } from "../linter/presets/default.js";
import { strictPreset } from "../linter/presets/strict.js";
import { leanPreset } from "../linter/presets/lean.js";

// ─── Types ──────────────────────────────────────────────────

interface LintOptions {
  fix?: boolean;
  strict?: boolean;
  format?: string; // "text" | "json" | "score"
  preset?: string; // "default" | "strict" | "lean"
}

// ─── Preset resolution ──────────────────────────────────────

const PRESETS: Record<string, typeof defaultPreset> = {
  default: defaultPreset,
  strict: strictPreset,
  lean: leanPreset,
};

// ─── Command ────────────────────────────────────────────────

export async function lintCommand(
  file: string,
  opts: LintOptions
): Promise<void> {
  const filePath = resolve(process.cwd(), file);

  if (!existsSync(filePath)) {
    console.error(chalk.red(`✖ File not found: ${filePath}`));
    console.log(chalk.dim("  Run `claudemd generate` to create one.\n"));
    process.exit(1);
  }

  const content = readFileSync(filePath, "utf-8");
  const rootDir = process.cwd();

  // Load config and detect stack
  const config = loadConfig(rootDir);
  const stack = await detectStack(rootDir);

  // Resolve preset
  const presetName = opts.preset ?? config.preset ?? "default";
  const preset = PRESETS[presetName] ?? defaultPreset;

  // Build lint context (async for accurate token counting)
  const ctx = await buildContextAsync(content, rootDir, stack.language, stack.framework);

  // Run rules with preset
  const results = runRules(ctx, {
    rules: preset.rules,
    overrides: { ...preset.overrides, ...config.rules },
  });

  const score = calculateScore(content, results);
  const total = totalScore(score);

  // ── Output formatting ──
  if (opts.format === "json") {
    console.log(JSON.stringify({ score: total, breakdown: score, results, preset: presetName }, null, 2));
    return;
  }

  if (opts.format === "score") {
    console.log(`\n${chalk.bold("CLAUDE.md Effectiveness Score:")} ${colorScore(total)}/100\n`);
    return;
  }

  // ── Full text output ──
  const errors = results.filter((r) => r.severity === "error");
  const warnings = results.filter((r) => r.severity === "warning");
  const suggestions = results.filter((r) => r.severity === "suggestion");

  console.log("");
  console.log(chalk.bold("╔══════════════════════════════════════════════════════╗"));
  console.log(chalk.bold(`║  CLAUDE.md Effectiveness Score: ${colorScore(total)}/100${" ".repeat(Math.max(0, 15 - total.toString().length))}║`));
  console.log(chalk.bold("╠══════════════════════════════════════════════════════╣"));
  console.log(`║                                                      ║`);
  console.log(`║  Token Efficiency    ${renderBar(score.tokenEfficiency)}  ${padNum(score.tokenEfficiency)}/100  ║`);
  console.log(`║  Actionability       ${renderBar(score.actionability)}  ${padNum(score.actionability)}/100  ║`);
  console.log(`║  Coverage            ${renderBar(score.coverage)}  ${padNum(score.coverage)}/100  ║`);
  console.log(`║  Specificity         ${renderBar(score.specificity)}  ${padNum(score.specificity)}/100  ║`);
  console.log(`║  Freshness           ${renderBar(score.freshness)}  ${padNum(score.freshness)}/100  ║`);
  console.log(`║  Anti-Pattern Free   ${renderBar(score.antiPatternFree)}  ${padNum(score.antiPatternFree)}/100  ║`);
  console.log(`║                                                      ║`);
  console.log(chalk.bold("╠══════════════════════════════════════════════════════╣"));
  console.log(
    chalk.bold(
      `║  ${errors.length} errors · ${warnings.length} warnings · ${suggestions.length} suggestions${" ".repeat(
        Math.max(0, 23 - `${errors.length}${warnings.length}${suggestions.length}`.length)
      )}║`
    )
  );
  if (presetName !== "default") {
    console.log(chalk.bold(`║  Preset: ${presetName}${" ".repeat(Math.max(0, 43 - presetName.length))}║`));
  }
  console.log(chalk.bold("╚══════════════════════════════════════════════════════╝"));

  // Print details
  if (errors.length > 0) {
    console.log(chalk.red.bold("\nERRORS:"));
    for (const r of errors) {
      const loc = r.line ? ` Line ${r.line}:` : "";
      console.log(chalk.red(`  ✖ [${r.ruleId}]${loc} ${r.message}`));
      if (r.fix && opts.fix) {
        console.log(chalk.green(`    → Fix: ${r.fix}`));
      }
    }
  }

  if (warnings.length > 0) {
    console.log(chalk.yellow.bold("\nWARNINGS:"));
    for (const r of warnings) {
      const loc = r.line ? ` Line ${r.line}:` : "";
      console.log(chalk.yellow(`  ⚠ [${r.ruleId}]${loc} ${r.message}`));
      if (r.fix && opts.fix) {
        console.log(chalk.green(`    → Fix: ${r.fix}`));
      }
    }
  }

  if (suggestions.length > 0) {
    console.log(chalk.cyan.bold("\nSUGGESTIONS:"));
    for (const r of suggestions) {
      const loc = r.line ? ` Line ${r.line}:` : "";
      console.log(chalk.cyan(`  💡 [${r.ruleId}]${loc} ${r.message}`));
      if (r.fix && opts.fix) {
        console.log(chalk.green(`    → Fix: ${r.fix}`));
      }
    }
  }

  console.log("");

  // Exit code for CI
  if (opts.strict && (errors.length > 0 || warnings.length > 0)) {
    process.exit(1);
  } else if (errors.length > 0) {
    process.exit(1);
  }
}

// ─── Helpers ────────────────────────────────────────────────

function renderBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  if (score >= 80) return chalk.green(bar);
  if (score >= 50) return chalk.yellow(bar);
  return chalk.red(bar);
}

function colorScore(score: number): string {
  if (score >= 80) return chalk.green.bold(score.toString());
  if (score >= 50) return chalk.yellow.bold(score.toString());
  return chalk.red.bold(score.toString());
}

function padNum(n: number): string {
  return n.toString().padStart(2, " ");
}
