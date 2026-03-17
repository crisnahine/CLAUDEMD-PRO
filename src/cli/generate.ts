/**
 * Generate Command
 *
 * Runs all analyzers against the codebase, then renders a CLAUDE.md
 * from the unified CodebaseProfile.
 */

import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { analyzeCodebase } from "../analyzers/index.js";
import { countTokens } from "../token/index.js";
import { renderClaudeMd } from "../core/generate.js";

interface GenerateOptions {
  output: string;
  framework?: string;
  modular?: boolean;
  monorepo?: boolean;
  merge?: boolean;
  dryRun?: boolean;
}

export async function generateCommand(opts: GenerateOptions): Promise<void> {
  const rootDir = process.cwd();
  const outputPath = resolve(rootDir, opts.output);

  console.log(chalk.bold("\n🔍 claudemd-pro — Analyzing codebase...\n"));

  const spinner = ora("Detecting stack...").start();

  // ── Run full analysis ──
  const profile = await analyzeCodebase({
    rootDir,
    framework: opts.framework,
  });

  spinner.succeed(
    `Detected: ${chalk.cyan(profile.stack.language)} / ${chalk.cyan(profile.stack.framework)} ` +
    `(${profile.architecture.totalFiles} files)`
  );

  // ── Render CLAUDE.md ──
  spinner.start("Generating CLAUDE.md...");
  const content = renderClaudeMd(profile, { modular: opts.modular });
  spinner.succeed("CLAUDE.md generated");

  // ── Token count ──
  const tokenEstimate = await countTokens(content);
  console.log(
    chalk.dim(`  Estimated tokens: ~${tokenEstimate} (${content.length} chars)`)
  );

  // ── Output ──
  if (opts.dryRun) {
    console.log(chalk.yellow("\n─── DRY RUN (not writing to disk) ───\n"));
    console.log(content);
    return;
  }

  if (opts.merge && existsSync(outputPath)) {
    console.log(
      chalk.yellow(
        `\n⚠ Merge mode: ${outputPath} exists. Manual merge required.`
      )
    );
    const mergedPath = outputPath.replace(".md", ".generated.md");
    writeFileSync(mergedPath, content, "utf-8");
    console.log(chalk.green(`✓ Generated file written to: ${mergedPath}`));
    console.log(chalk.dim("  Diff it against your existing CLAUDE.md and merge manually."));
    return;
  }

  writeFileSync(outputPath, content, "utf-8");
  console.log(chalk.green(`\n✓ Written to: ${outputPath}`));
  console.log(
    chalk.dim("  Run `claudemd lint` to check effectiveness score.\n")
  );
}
