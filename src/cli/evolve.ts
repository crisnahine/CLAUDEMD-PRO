/**
 * Evolve Command
 *
 * Detects codebase drift — identifies when a CLAUDE.md has gone stale
 * by comparing it against the current state of the codebase.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { detectDrift, type DriftItem, type DriftReport } from "../evolve/index.js";

// ─── Types ──────────────────────────────────────────────────

export interface EvolveOptions {
  apply?: boolean;
  ci?: boolean;
  format?: string;
}

// ─── Severity display ───────────────────────────────────────

const SEVERITY_ICON: Record<DriftItem["severity"], string> = {
  critical: chalk.red("✖"),
  warning: chalk.yellow("⚠"),
  info: chalk.cyan("ℹ"),
};

const SEVERITY_COLOR: Record<DriftItem["severity"], (s: string) => string> = {
  critical: chalk.red,
  warning: chalk.yellow,
  info: chalk.cyan,
};

// ─── Command ────────────────────────────────────────────────

export async function evolveCommand(file: string, opts: EvolveOptions): Promise<void> {
  const rootDir = process.cwd();
  const claudeMdPath = resolve(rootDir, file);

  if (!existsSync(claudeMdPath)) {
    console.error(chalk.red(`✖ File not found: ${claudeMdPath}`));
    console.log(chalk.dim("  Run `claudemd generate` to create one.\n"));
    process.exit(1);
  }

  // Run drift detection
  const report = await detectDrift(rootDir, claudeMdPath);

  // ── JSON output ──
  if (opts.format === "json") {
    console.log(JSON.stringify(report, null, 2));
    if (opts.ci) {
      exitForCi(report);
    }
    return;
  }

  // ── Text output ──
  renderReport(report);

  // ── Auto-apply fixes ──
  if (opts.apply) {
    applyFixes(claudeMdPath, report);
  }

  // ── CI exit code ──
  if (opts.ci) {
    exitForCi(report);
  }
}

// ─── Report renderer ────────────────────────────────────────

function renderReport(report: DriftReport): void {
  const { driftItems, currentScore, estimatedScoreAfterFix } = report;
  const criticalCount = driftItems.filter((i) => i.severity === "critical").length;
  const warningCount = driftItems.filter((i) => i.severity === "warning").length;
  const infoCount = driftItems.filter((i) => i.severity === "info").length;
  const fixableCount = driftItems.filter((i) => i.autoFix).length;

  // ── Header ──
  console.log("");
  console.log(chalk.bold("╔══════════════════════════════════════════════════════╗"));
  console.log(chalk.bold(`║  CLAUDE.md Drift Report                              ║`));
  console.log(chalk.bold("╠══════════════════════════════════════════════════════╣"));
  console.log(`║                                                      ║`);
  console.log(`║  Freshness Score     ${renderBar(currentScore)}  ${padNum(currentScore)}/100  ║`);

  if (fixableCount > 0) {
    console.log(`║  After Auto-Fix      ${renderBar(estimatedScoreAfterFix)}  ${padNum(estimatedScoreAfterFix)}/100  ║`);
  }

  console.log(`║                                                      ║`);
  console.log(chalk.bold("╠══════════════════════════════════════════════════════╣"));
  console.log(
    chalk.bold(
      `║  ${criticalCount} critical · ${warningCount} warnings · ${infoCount} info${" ".repeat(
        Math.max(0, 24 - `${criticalCount}${warningCount}${infoCount}`.length)
      )}║`
    )
  );

  if (fixableCount > 0) {
    console.log(
      chalk.bold(
        `║  ${fixableCount} auto-fixable (run with --apply)${" ".repeat(
          Math.max(0, 24 - fixableCount.toString().length)
        )}║`
      )
    );
  }

  console.log(chalk.bold("╚══════════════════════════════════════════════════════╝"));

  if (driftItems.length === 0) {
    console.log(chalk.green.bold("\n  Your CLAUDE.md is up to date!\n"));
    return;
  }

  // ── Critical items ──
  const criticals = driftItems.filter((i) => i.severity === "critical");
  if (criticals.length > 0) {
    console.log(chalk.red.bold("\nCRITICAL:"));
    for (const item of criticals) {
      printDriftItem(item);
    }
  }

  // ── Warnings ──
  const warnings = driftItems.filter((i) => i.severity === "warning");
  if (warnings.length > 0) {
    console.log(chalk.yellow.bold("\nWARNINGS:"));
    for (const item of warnings) {
      printDriftItem(item);
    }
  }

  // ── Info ──
  const infos = driftItems.filter((i) => i.severity === "info");
  if (infos.length > 0) {
    console.log(chalk.cyan.bold("\nINFO:"));
    for (const item of infos) {
      printDriftItem(item);
    }
  }

  console.log("");
}

function printDriftItem(item: DriftItem): void {
  const icon = SEVERITY_ICON[item.severity];
  const color = SEVERITY_COLOR[item.severity];
  const fixTag = item.autoFix ? chalk.dim(" [auto-fixable]") : "";

  console.log(color(`  ${icon} [${item.type}] ${item.message}${fixTag}`));
  console.log(chalk.green(`    → ${item.suggestion}`));
}

// ─── Auto-apply ─────────────────────────────────────────────

function applyFixes(claudeMdPath: string, report: DriftReport): void {
  const fixable = report.driftItems.filter((i) => i.autoFix);
  if (fixable.length === 0) {
    console.log(chalk.dim("  No auto-fixable items.\n"));
    return;
  }

  let content = readFileSync(claudeMdPath, "utf-8");
  let applied = 0;

  for (const item of fixable) {
    const fix = item.autoFix!;

    if (fix.oldText && content.includes(fix.oldText)) {
      // Replace existing text
      if (fix.newText) {
        content = content.replace(fix.oldText, fix.newText);
      } else {
        // Remove the line containing oldText
        const lines = content.split("\n");
        content = lines.filter((l) => !l.includes(fix.oldText!)).join("\n");
      }
      applied++;
    } else if (!fix.oldText && fix.newText) {
      // Append to section
      content = appendToSection(content, fix.section, fix.newText);
      applied++;
    }
  }

  if (applied > 0) {
    writeFileSync(claudeMdPath, content, "utf-8");
    console.log(chalk.green.bold(`  Applied ${applied} auto-fix(es) to CLAUDE.md.`));
    console.log(chalk.dim("  Review the changes and commit when ready.\n"));
  } else {
    console.log(chalk.dim("  No fixes could be applied automatically.\n"));
  }
}

/**
 * Append new content to a named section (## Heading).
 * If the section doesn't exist, it is created at the end.
 */
function appendToSection(content: string, sectionName: string, newText: string): string {
  const lines = content.split("\n");
  const sectionPattern = new RegExp(
    `^##\\s+${escapeRegex(sectionName)}`,
    "i"
  );

  let sectionStart = -1;
  let sectionEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (sectionPattern.test(lines[i])) {
      sectionStart = i;
    } else if (sectionStart >= 0 && lines[i].startsWith("## ")) {
      sectionEnd = i;
      break;
    }
  }

  if (sectionStart >= 0) {
    // Check if the section has a code block — insert before the closing ```
    const sectionContent = lines.slice(sectionStart, sectionEnd).join("\n");
    if (sectionContent.includes("```")) {
      // Find last ``` in the section
      for (let i = sectionEnd - 1; i > sectionStart; i--) {
        if (lines[i].trim() === "```") {
          lines.splice(i, 0, newText);
          return lines.join("\n");
        }
      }
    }

    // Otherwise insert before the next section
    lines.splice(sectionEnd, 0, newText);
  } else {
    // Section doesn't exist — create it
    const sectionHeader = getSectionHeader(sectionName);
    lines.push("", sectionHeader, newText, "");
  }

  return lines.join("\n");
}

function getSectionHeader(sectionName: string): string {
  const lowerName = sectionName.toLowerCase();
  if (lowerName.includes("gotcha")) return "## Gotchas — DON'T Do This";
  if (lowerName.includes("architecture")) return "## Architecture";
  if (lowerName.includes("command")) return "## Commands";
  if (lowerName.includes("context")) return "## Critical Context";
  return `## ${sectionName}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── CI exit code ───────────────────────────────────────────

function exitForCi(report: DriftReport): void {
  const hasCriticalOrWarning = report.driftItems.some(
    (i) => i.severity === "critical" || i.severity === "warning"
  );
  if (hasCriticalOrWarning) {
    process.exit(1);
  }
}

// ─── Shared display helpers ─────────────────────────────────

function renderBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  if (score >= 80) return chalk.green(bar);
  if (score >= 50) return chalk.yellow(bar);
  return chalk.red(bar);
}

function padNum(n: number): string {
  return n.toString().padStart(3, " ");
}
