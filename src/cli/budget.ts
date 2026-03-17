/**
 * Budget Command
 *
 * Shows token breakdown by section and suggests optimizations.
 * Uses tiktoken for accurate counts when available.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { countTokens, estimateTokens } from "../token/index.js";

interface BudgetOptions {
  optimize?: boolean;
  maxTokens?: string;
}

export async function budgetCommand(file: string, opts: BudgetOptions): Promise<void> {
  const filePath = resolve(process.cwd(), file);

  if (!existsSync(filePath)) {
    console.error(chalk.red(`✖ File not found: ${filePath}`));
    process.exit(1);
  }

  const content = readFileSync(filePath, "utf-8");
  const maxTokens = parseInt(opts.maxTokens ?? "3000", 10);

  // Parse sections
  const sections = parseSections(content);
  const totalTokens = await countTokens(content);

  console.log(chalk.bold("\nCLAUDE.md Token Budget Analysis"));
  console.log("━".repeat(50));
  console.log(
    `Total tokens: ${colorTokens(totalTokens, maxTokens)} (${content.length} chars)`
  );
  console.log(`Budget:       ${maxTokens} tokens`);
  console.log(
    `Status:       ${totalTokens <= maxTokens ? chalk.green("✓ Within budget") : chalk.red("✖ Over budget by " + (totalTokens - maxTokens))}`
  );

  console.log(chalk.bold("\nBreakdown by section:"));

  // Header/preamble (before first ##)
  const preambleEnd = content.indexOf("\n## ");
  if (preambleEnd > 0) {
    const preamble = content.substring(0, preambleEnd);
    const preambleTokens = await countTokens(preamble);
    const pct = Math.round((preambleTokens / totalTokens) * 100);
    printBar("Header/Preamble", preambleTokens, totalTokens, pct);
  }

  for (const section of sections) {
    const sectionTokens = await countTokens(section.content);
    const pct = Math.round((sectionTokens / totalTokens) * 100);
    const warning = pct > 25 ? " ⚠️" : "";
    printBar(`${section.heading}${warning}`, sectionTokens, totalTokens, pct);
  }

  // Optimization suggestions
  if (opts.optimize) {
    console.log(chalk.bold("\nOptimization Recommendations:"));
    let potentialSavings = 0;

    // Find style/formatting sections that should be linter rules
    for (const section of sections) {
      const lower = section.heading.toLowerCase();
      const sectionTokens = await countTokens(section.content);

      if (
        lower.includes("style") ||
        lower.includes("formatting") ||
        lower.includes("code conventions")
      ) {
        console.log(
          chalk.yellow(
            `  → Remove "${section.heading}" (-${sectionTokens} tokens). Use a linter instead.`
          )
        );
        potentialSavings += sectionTokens;
      }

      // Large sections that could be @imported
      if (sectionTokens > 500) {
        const savings = Math.round(sectionTokens * 0.6);
        console.log(
          chalk.cyan(
            `  → Move "${section.heading}" to @import (-${savings} tokens from root)`
          )
        );
        potentialSavings += savings;
      }
    }

    if (potentialSavings > 0) {
      const optimized = totalTokens - potentialSavings;
      const pctSaved = Math.round((potentialSavings / totalTokens) * 100);
      console.log(
        chalk.green(
          `\n  Optimized total: ~${optimized} tokens (${pctSaved}% reduction)`
        )
      );
    } else {
      console.log(chalk.green("  No major optimizations found. Looking good!"));
    }
  }

  console.log("");
}

// ─── Helpers ────────────────────────────────────────────────

interface Section {
  heading: string;
  content: string;
}

function parseSections(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split("\n");
  let heading = "";
  let sectionContent = "";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (heading) sections.push({ heading, content: sectionContent });
      heading = line.replace("## ", "").trim();
      sectionContent = "";
    } else {
      sectionContent += line + "\n";
    }
  }
  if (heading) sections.push({ heading, content: sectionContent });

  return sections;
}

function colorTokens(tokens: number, max: number): string {
  const str = `~${tokens}`;
  if (tokens > max) return chalk.red.bold(str);
  if (tokens > max * 0.8) return chalk.yellow.bold(str);
  return chalk.green.bold(str);
}

function printBar(label: string, tokens: number, total: number, pct: number): void {
  const barWidth = 10;
  const filled = Math.round((pct / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);

  const coloredBar = pct > 25 ? chalk.red(bar) : pct > 15 ? chalk.yellow(bar) : chalk.green(bar);
  const paddedLabel = label.padEnd(25);
  console.log(`  ${paddedLabel} ${coloredBar}  ${tokens} tokens (${pct}%)`);
}
