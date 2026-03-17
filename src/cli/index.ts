#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { generateCommand } from "./generate.js";
import { lintCommand } from "./lint.js";
import { budgetCommand } from "./budget.js";
import { evolveCommand } from "./evolve.js";
import { compareCommand } from "./compare.js";

const program = new Command();

program
  .name("claudemd")
  .description(
    "Deep codebase-aware CLAUDE.md generator, linter, and effectiveness scorer"
  )
  .version("0.3.0");

// ─── generate ───────────────────────────────────────────────
program
  .command("generate")
  .description("Analyze codebase and generate a battle-tested CLAUDE.md")
  .option("-o, --output <path>", "Output file path", "./CLAUDE.md")
  .option("-f, --framework <name>", "Force framework (auto-detected by default)")
  .option("--modular", "Generate with @import structure for large projects")
  .option("--monorepo", "Enable monorepo-aware generation")
  .option("--merge", "Merge with existing CLAUDE.md instead of overwriting")
  .option("--dry-run", "Preview output without writing to disk")
  .action(generateCommand);

// ─── lint ───────────────────────────────────────────────────
program
  .command("lint")
  .description("Score your CLAUDE.md on effectiveness (not just structure)")
  .argument("[file]", "Path to CLAUDE.md", "./CLAUDE.md")
  .option("--fix", "Show auto-fix suggestions")
  .option("--strict", "Fail on warnings too (useful for CI)")
  .option("--format <type>", "Output format: text, json, score", "text")
  .option("--preset <name>", "Rule preset: default, strict, lean")
  .action(lintCommand);

// ─── budget ─────────────────────────────────────────────────
program
  .command("budget")
  .description("Show token breakdown and optimization suggestions")
  .argument("[file]", "Path to CLAUDE.md", "./CLAUDE.md")
  .option("--optimize", "Include token-saving suggestions")
  .option("--max-tokens <n>", "Set a token ceiling", "3000")
  .action(budgetCommand);

// ─── score (shortcut) ───────────────────────────────────────
program
  .command("score")
  .description("Quick effectiveness score (0-100)")
  .argument("[file]", "Path to CLAUDE.md", "./CLAUDE.md")
  .action(async (file: string) => {
    // Delegate to lint with score-only output
    await lintCommand(file, { format: "score" });
  });

// ─── evolve ─────────────────────────────────────────────────
program
  .command("evolve")
  .description("Detect codebase drift and suggest CLAUDE.md updates")
  .argument("[file]", "Path to CLAUDE.md", "./CLAUDE.md")
  .option("--apply", "Auto-apply safe updates")
  .option("--ci", "CI mode: exit 1 if drift detected")
  .option("--format <type>", "Output format: text, json", "text")
  .action(evolveCommand);

// ─── compare ────────────────────────────────────────────────
program
  .command("compare")
  .description("Compare two CLAUDE.md files — before/after scoring")
  .argument("<fileA>", "First CLAUDE.md (before)")
  .argument("<fileB>", "Second CLAUDE.md (after)")
  .option("--format <type>", "Output format: text, json", "text")
  .action(compareCommand);

// ─── serve (MCP server) ─────────────────────────────────────
program
  .command("serve")
  .description("Start MCP server for Claude Desktop / Claude Code integration")
  .action(async () => {
    const { startMcpServer } = await import("../mcp/index.js");
    await startMcpServer();
  });

program.parse();
