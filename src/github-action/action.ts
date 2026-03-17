/**
 * GitHub Action Wrapper
 *
 * Runs claudemd lint on a CLAUDE.md file and outputs results as GitHub
 * Action annotations. Optionally runs drift detection and posts PR comments.
 *
 * Environment variables:
 *   INPUT_FILE           - Path to CLAUDE.md (default: ./CLAUDE.md)
 *   INPUT_THRESHOLD      - Minimum passing score 0-100 (default: 60)
 *   INPUT_STRICT         - Fail on warnings too (default: false)
 *   INPUT_CHECK-DRIFT    - Run drift detection alongside lint (default: false)
 *   INPUT_COMMENT-ON-PR  - Post results as PR comment (default: false)
 *
 * Outputs (via $GITHUB_OUTPUT):
 *   score       - Numeric effectiveness score (0-100)
 *   errors      - Number of lint errors found
 *   warnings    - Number of lint warnings found
 *   drift-items - Number of drift items (if check-drift enabled)
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import {
  buildContext,
  runRules,
  calculateScore,
  totalScore,
} from "../linter/index.js";
import { detectDrift, type DriftReport } from "../evolve/index.js";

// ─── GitHub Actions Helpers ──────────────────────────────────

function getInput(name: string, fallback: string): string {
  return process.env[`INPUT_${name.toUpperCase()}`] ?? fallback;
}

function setOutput(name: string, value: string): void {
  const outputFile = process.env["GITHUB_OUTPUT"];
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${value}\n`);
  } else {
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

// ─── PR Comment ──────────────────────────────────────────────

function postPrComment(body: string): void {
  const token = process.env["GITHUB_TOKEN"];
  const eventPath = process.env["GITHUB_EVENT_PATH"];

  if (!token || !eventPath) {
    console.log("::warning::comment-on-pr requires GITHUB_TOKEN and a pull_request event");
    return;
  }

  let prNumber: number | null = null;
  try {
    const event = JSON.parse(readFileSync(eventPath, "utf-8"));
    prNumber = event?.pull_request?.number ?? event?.issue?.number ?? null;
  } catch {
    // Not a PR event
  }

  if (!prNumber) {
    console.log("::notice::Not a pull_request event — skipping PR comment");
    return;
  }

  const repo = process.env["GITHUB_REPOSITORY"];
  if (!repo) return;

  const apiUrl = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;

  try {
    execSync(
      `curl -sS -X POST "${apiUrl}" ` +
      `-H "Authorization: token ${token}" ` +
      `-H "Content-Type: application/json" ` +
      `-d @-`,
      { input: JSON.stringify({ body }), stdio: ["pipe", "pipe", "pipe"] }
    );
    console.log(`Posted lint results to PR #${prNumber}`);
  } catch (err) {
    console.log(`::warning::Failed to post PR comment: ${err instanceof Error ? err.message : err}`);
  }
}

// ─── Main ────────────────────────────────────────────────────

async function run(): Promise<void> {
  const file = getInput("file", "./CLAUDE.md");
  const threshold = parseInt(getInput("threshold", "60"), 10);
  const strict = getInput("strict", "false") === "true";
  const checkDrift = getInput("check-drift", "false") === "true";
  const commentOnPr = getInput("comment-on-pr", "false") === "true";

  const filePath = resolve(process.cwd(), file);

  // Check file exists
  if (!existsSync(filePath)) {
    annotateError(`CLAUDE.md not found at ${filePath}. Run 'npx claudemd-pro generate' to create one.`);
    setOutput("score", "0");
    setOutput("errors", "1");
    setOutput("warnings", "0");
    setOutput("drift-items", "0");
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

  // Set lint outputs
  setOutput("score", String(score));
  setOutput("errors", String(errors.length));
  setOutput("warnings", String(warnings.length));

  // ── Drift detection (optional) ──
  let driftReport: DriftReport | null = null;
  if (checkDrift) {
    try {
      driftReport = await detectDrift(rootDir, filePath);
      const driftItemCount = driftReport.driftItems.length;
      setOutput("drift-items", String(driftItemCount));

      if (driftItemCount > 0) {
        console.log(`Drift Detection: ${driftItemCount} items found (freshness: ${driftReport.currentScore}/100)`);
        for (const item of driftReport.driftItems) {
          const fn = item.severity === "critical" ? annotateError
            : item.severity === "warning" ? annotateWarning
            : annotateNotice;
          fn(`[drift:${item.type}] ${item.message}`, file);
        }
      } else {
        console.log("Drift Detection: CLAUDE.md is up to date");
      }
    } catch (err) {
      annotateWarning(`Drift detection failed: ${err instanceof Error ? err.message : err}`);
      setOutput("drift-items", "0");
    }
  } else {
    setOutput("drift-items", "0");
  }

  // ── PR Comment (optional) ──
  if (commentOnPr) {
    const commentBody = buildPrComment(score, breakdown, errors, warnings, suggestions, driftReport);
    postPrComment(commentBody);
  }

  // ── Exit code ──
  if (score < threshold) {
    annotateError(`CLAUDE.md score ${score} is below threshold ${threshold}`);
    process.exit(1);
  }

  if (strict && (errors.length > 0 || warnings.length > 0)) {
    annotateError(`Strict mode: ${errors.length} errors and ${warnings.length} warnings found`);
    process.exit(1);
  }

  if (errors.length > 0) {
    process.exit(1);
  }

  console.log(`CLAUDE.md passed with score ${score}/100 (threshold: ${threshold})`);
}

function buildPrComment(
  score: number,
  breakdown: ReturnType<typeof calculateScore>,
  errors: ReturnType<typeof runRules>,
  warnings: ReturnType<typeof runRules>,
  suggestions: ReturnType<typeof runRules>,
  driftReport: DriftReport | null
): string {
  const scoreEmoji = score >= 80 ? "🟢" : score >= 60 ? "🟡" : "🔴";
  const lines: string[] = [
    `## ${scoreEmoji} CLAUDE.md Effectiveness: ${score}/100`,
    "",
    "| Dimension | Score |",
    "| --- | --- |",
    `| Token Efficiency | ${breakdown.tokenEfficiency}/100 |`,
    `| Actionability | ${breakdown.actionability}/100 |`,
    `| Coverage | ${breakdown.coverage}/100 |`,
    `| Specificity | ${breakdown.specificity}/100 |`,
    `| Freshness | ${breakdown.freshness}/100 |`,
    `| Anti-Pattern Free | ${breakdown.antiPatternFree}/100 |`,
    "",
    `**${errors.length}** errors · **${warnings.length}** warnings · **${suggestions.length}** suggestions`,
  ];

  if (errors.length > 0) {
    lines.push("", "### Errors", ...errors.map((r) => `- \`${r.ruleId}\`: ${r.message}`));
  }

  if (warnings.length > 0) {
    lines.push("", "### Warnings", ...warnings.map((r) => `- \`${r.ruleId}\`: ${r.message}`));
  }

  if (driftReport && driftReport.driftItems.length > 0) {
    lines.push(
      "",
      `### Drift Detection (freshness: ${driftReport.currentScore}/100)`,
      ...driftReport.driftItems.map(
        (i) => `- **${i.severity}** \`${i.type}\`: ${i.message}`
      )
    );
  }

  lines.push("", "---", "*Generated by [claudemd-pro](https://github.com/crisnahine/claudemd-pro)*");

  return lines.join("\n");
}

run().catch((err) => {
  annotateError(`claudemd-pro action failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
