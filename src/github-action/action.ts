/**
 * GitHub Action Wrapper
 *
 * Runs claudemd lint on a CLAUDE.md file and outputs results as GitHub
 * Action annotations. Reads configuration from INPUT_* environment
 * variables following GitHub Actions conventions.
 *
 * Environment variables:
 *   INPUT_FILE       - Path to CLAUDE.md (default: ./CLAUDE.md)
 *   INPUT_THRESHOLD  - Minimum passing score 0-100 (default: 60)
 *   INPUT_STRICT     - Fail on warnings too (default: false)
 *
 * Outputs (via ::set-output):
 *   score     - Numeric effectiveness score (0-100)
 *   errors    - Number of lint errors found
 *   warnings  - Number of lint warnings found
 */

import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildContext,
  runRules,
  calculateScore,
  totalScore,
} from "../linter/index.js";

// ─── GitHub Actions Helpers ──────────────────────────────────

function getInput(name: string, fallback: string): string {
  return process.env[`INPUT_${name.toUpperCase()}`] ?? fallback;
}

function setOutput(name: string, value: string): void {
  // GitHub Actions output format
  const outputFile = process.env["GITHUB_OUTPUT"];
  if (outputFile) {
    // New-style: append to $GITHUB_OUTPUT file
    appendFileSync(outputFile, `${name}=${value}\n`);
  } else {
    // Legacy fallback
    console.log(`::set-output name=${name}::${value}`);
  }
}

function annotateError(message: string, file?: string, line?: number): void {
  const props: string[] = [];
  if (file) props.push(`file=${file}`);
  if (line) props.push(`line=${line}`);
  const propsStr = props.length > 0 ? ` ${props.join(",")}` : "";
  console.log(`::error${propsStr}::${message}`);
}

function annotateWarning(message: string, file?: string, line?: number): void {
  const props: string[] = [];
  if (file) props.push(`file=${file}`);
  if (line) props.push(`line=${line}`);
  const propsStr = props.length > 0 ? ` ${props.join(",")}` : "";
  console.log(`::warning${propsStr}::${message}`);
}

function annotateNotice(message: string, file?: string, line?: number): void {
  const props: string[] = [];
  if (file) props.push(`file=${file}`);
  if (line) props.push(`line=${line}`);
  const propsStr = props.length > 0 ? ` ${props.join(",")}` : "";
  console.log(`::notice${propsStr}::${message}`);
}

// ─── Main ────────────────────────────────────────────────────

async function run(): Promise<void> {
  const file = getInput("file", "./CLAUDE.md");
  const threshold = parseInt(getInput("threshold", "60"), 10);
  const strict = getInput("strict", "false") === "true";

  const filePath = resolve(process.cwd(), file);

  // Check file exists
  if (!existsSync(filePath)) {
    annotateError(`CLAUDE.md not found at ${filePath}. Run 'npx claudemd-pro generate' to create one.`);
    setOutput("score", "0");
    setOutput("errors", "1");
    setOutput("warnings", "0");
    process.exit(1);
  }

  const content = readFileSync(filePath, "utf-8");
  const rootDir = process.cwd();

  // Run linter
  const ctx = buildContext(content, rootDir);
  const results = runRules(ctx);
  const breakdown = calculateScore(content, results);
  const score = totalScore(breakdown);

  // Categorize results
  const errors = results.filter((r) => r.severity === "error");
  const warnings = results.filter((r) => r.severity === "warning");
  const suggestions = results.filter((r) => r.severity === "suggestion");

  // Emit annotations
  for (const r of errors) {
    annotateError(`[${r.ruleId}] ${r.message}${r.fix ? ` (fix: ${r.fix})` : ""}`, file, r.line);
  }

  for (const r of warnings) {
    annotateWarning(`[${r.ruleId}] ${r.message}${r.fix ? ` (fix: ${r.fix})` : ""}`, file, r.line);
  }

  for (const r of suggestions) {
    annotateNotice(`[${r.ruleId}] ${r.message}${r.fix ? ` (fix: ${r.fix})` : ""}`, file, r.line);
  }

  // Print summary
  console.log("");
  console.log(`CLAUDE.md Effectiveness Score: ${score}/100`);
  console.log(`  Token Efficiency:  ${breakdown.tokenEfficiency}/100`);
  console.log(`  Actionability:     ${breakdown.actionability}/100`);
  console.log(`  Coverage:          ${breakdown.coverage}/100`);
  console.log(`  Specificity:       ${breakdown.specificity}/100`);
  console.log(`  Freshness:         ${breakdown.freshness}/100`);
  console.log(`  Anti-Pattern Free: ${breakdown.antiPatternFree}/100`);
  console.log("");
  console.log(`  ${errors.length} errors, ${warnings.length} warnings, ${suggestions.length} suggestions`);
  console.log("");

  // Set outputs
  setOutput("score", String(score));
  setOutput("errors", String(errors.length));
  setOutput("warnings", String(warnings.length));

  // Determine exit code
  if (score < threshold) {
    annotateError(
      `CLAUDE.md score ${score} is below threshold ${threshold}`
    );
    process.exit(1);
  }

  if (strict && (errors.length > 0 || warnings.length > 0)) {
    annotateError(
      `Strict mode: ${errors.length} errors and ${warnings.length} warnings found`
    );
    process.exit(1);
  }

  if (errors.length > 0) {
    process.exit(1);
  }

  console.log(`CLAUDE.md passed with score ${score}/100 (threshold: ${threshold})`);
}

run().catch((err) => {
  annotateError(`claudemd-pro action failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
