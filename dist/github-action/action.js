import {
  buildContext,
  calculateScore,
  runRules,
  totalScore
} from "../chunk-OWG3WG3R.js";

// src/github-action/action.ts
import { existsSync, readFileSync, appendFileSync } from "fs";
import { resolve } from "path";
function getInput(name, fallback) {
  return process.env[`INPUT_${name.toUpperCase()}`] ?? fallback;
}
function setOutput(name, value) {
  const outputFile = process.env["GITHUB_OUTPUT"];
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${value}
`);
  } else {
    console.log(`::set-output name=${name}::${value}`);
  }
}
function annotateError(message, file, line) {
  const props = [];
  if (file) props.push(`file=${file}`);
  if (line) props.push(`line=${line}`);
  const propsStr = props.length > 0 ? ` ${props.join(",")}` : "";
  console.log(`::error${propsStr}::${message}`);
}
function annotateWarning(message, file, line) {
  const props = [];
  if (file) props.push(`file=${file}`);
  if (line) props.push(`line=${line}`);
  const propsStr = props.length > 0 ? ` ${props.join(",")}` : "";
  console.log(`::warning${propsStr}::${message}`);
}
function annotateNotice(message, file, line) {
  const props = [];
  if (file) props.push(`file=${file}`);
  if (line) props.push(`line=${line}`);
  const propsStr = props.length > 0 ? ` ${props.join(",")}` : "";
  console.log(`::notice${propsStr}::${message}`);
}
async function run() {
  const file = getInput("file", "./CLAUDE.md");
  const threshold = parseInt(getInput("threshold", "60"), 10);
  const strict = getInput("strict", "false") === "true";
  const filePath = resolve(process.cwd(), file);
  if (!existsSync(filePath)) {
    annotateError(`CLAUDE.md not found at ${filePath}. Run 'npx claudemd-pro generate' to create one.`);
    setOutput("score", "0");
    setOutput("errors", "1");
    setOutput("warnings", "0");
    process.exit(1);
  }
  const content = readFileSync(filePath, "utf-8");
  const rootDir = process.cwd();
  const ctx = buildContext(content, rootDir);
  const results = runRules(ctx);
  const breakdown = calculateScore(content, results);
  const score = totalScore(breakdown);
  const errors = results.filter((r) => r.severity === "error");
  const warnings = results.filter((r) => r.severity === "warning");
  const suggestions = results.filter((r) => r.severity === "suggestion");
  for (const r of errors) {
    annotateError(`[${r.ruleId}] ${r.message}${r.fix ? ` (fix: ${r.fix})` : ""}`, file, r.line);
  }
  for (const r of warnings) {
    annotateWarning(`[${r.ruleId}] ${r.message}${r.fix ? ` (fix: ${r.fix})` : ""}`, file, r.line);
  }
  for (const r of suggestions) {
    annotateNotice(`[${r.ruleId}] ${r.message}${r.fix ? ` (fix: ${r.fix})` : ""}`, file, r.line);
  }
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
  setOutput("score", String(score));
  setOutput("errors", String(errors.length));
  setOutput("warnings", String(warnings.length));
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
