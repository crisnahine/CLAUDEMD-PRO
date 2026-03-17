// src/linter/rules/token-budget.ts
var tokenBudgetRule = {
  id: "token-budget",
  severity: "error",
  description: "Root CLAUDE.md should be under ~3000 tokens",
  run(ctx) {
    const tokens = ctx.estimatedTokens;
    if (tokens > 4e3) {
      return [{
        ruleId: this.id,
        severity: "error",
        message: `CLAUDE.md is ~${tokens} tokens. Recommended max is ~3000 for root file. Every token here is loaded in EVERY session.`,
        fix: "Split into root CLAUDE.md + @import child files for subdirectories."
      }];
    }
    if (tokens > 3e3) {
      return [{
        ruleId: this.id,
        severity: "warning",
        message: `CLAUDE.md is ~${tokens} tokens. Approaching the ~3000 recommended limit.`,
        fix: "Consider moving verbose sections to @import child files."
      }];
    }
    return [];
  }
};

// src/linter/rules/token-bloat.ts
var tokenBloatRule = {
  id: "token-bloat",
  severity: "warning",
  description: "Single section should not dominate the token budget",
  run(ctx) {
    const results = [];
    for (const section of ctx.sections) {
      const sectionTokens = Math.ceil(section.content.length / 4);
      const pct = Math.round(sectionTokens / Math.max(ctx.estimatedTokens, 1) * 100);
      if (pct > 25 && sectionTokens > 400) {
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `Section "${section.heading}" is ${sectionTokens} tokens (${pct}% of total). Consider trimming or moving to @import.`,
          line: section.line
        });
      }
    }
    return results;
  }
};

// src/linter/rules/missing-verify.ts
var missingVerifyRule = {
  id: "missing-verify",
  severity: "error",
  description: "Must include test/lint/typecheck commands",
  run(ctx) {
    const hasVerification = /\b(test|spec|lint|typecheck|tsc|rubocop|eslint|rspec|pytest|vitest|jest|cargo\s+test|go\s+test|mix\s+test|phpunit|phpstan|mypy|ruff)\b/i.test(ctx.content);
    if (!hasVerification) {
      return [{
        ruleId: this.id,
        severity: "error",
        message: "No verification commands found. Claude can't confirm its work without test/lint/typecheck commands.",
        fix: "Add a '## Commands' section with test, lint, and typecheck commands."
      }];
    }
    return [];
  }
};

// src/linter/rules/stale-ref.ts
import { existsSync } from "fs";
import { resolve } from "path";
var staleRefRule = {
  id: "stale-ref",
  severity: "error",
  description: "References to non-existent paths",
  run(ctx) {
    const results = [];
    const pathPattern = /(?:^|\s)(\/[a-zA-Z][a-zA-Z0-9_\-./]+\/?)(?:\s|$|`)/gm;
    let match;
    while ((match = pathPattern.exec(ctx.content)) !== null) {
      const refPath = match[1].replace(/[`\s]/g, "");
      if (refPath.startsWith("/src/") || refPath.startsWith("/app/") || refPath.startsWith("/lib/") || refPath.startsWith("/config/") || refPath.startsWith("/test/") || refPath.startsWith("/tests/") || refPath.startsWith("/spec/") || refPath.startsWith("/packages/") || refPath.startsWith("/prisma/") || refPath.startsWith("/db/")) {
        const fsPath = resolve(ctx.rootDir, refPath.slice(1));
        if (!existsSync(fsPath)) {
          const lineNum = ctx.content.substring(0, match.index).split("\n").length;
          results.push({
            ruleId: this.id,
            severity: "error",
            message: `References \`${refPath}\` \u2014 file/directory does not exist.`,
            line: lineNum,
            fix: "Verify the correct path and update, or remove the reference."
          });
        }
      }
    }
    return results;
  }
};

// src/linter/rules/style-vs-linter.ts
var STYLE_PATTERNS = [
  /prefer\s+(single|double)\s+quotes/i,
  /use\s+(2|4)\s+space(s)?\s+indent/i,
  /semicolons?\s+(always|never)/i,
  /trailing\s+comma/i,
  /max\s+line\s+length/i,
  /use\s+camelCase/i,
  /tabs?\s+vs\.?\s+spaces?/i,
  /\bPEP\s*8\b/i,
  /\bairbnb\s+style/i,
  /\bstandard\s+style/i,
  /\bprettier\s+config/i,
  /line\s+endings?\s+(lf|crlf)/i,
  /bracket\s+(same|next)\s+line/i
];
var styleVsLinterRule = {
  id: "style-vs-linter",
  severity: "warning",
  description: "Style/formatting rules should use linter configs, not CLAUDE.md",
  run(ctx) {
    const results = [];
    for (const pattern of STYLE_PATTERNS) {
      const match = ctx.content.match(pattern);
      if (match) {
        const lineNum = ctx.content.substring(0, ctx.content.indexOf(match[0])).split("\n").length;
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `"${match[0].trim()}" is a formatting rule. Use a linter/formatter instead \u2014 saves tokens and enforces deterministically.`,
          line: lineNum,
          fix: "Move this to your linter config and add a lint command to CLAUDE.md instead."
        });
      }
    }
    return results;
  }
};

// src/linter/rules/vague.ts
var VAGUE_PATTERNS = [
  { pattern: /follow\s+best\s+practices/i, fix: "Specify which practices and patterns to use" },
  { pattern: /write\s+clean\s+code/i, fix: "Define what 'clean' means in this project" },
  { pattern: /use\s+proper\s+(error\s+)?handling/i, fix: "Show the actual error handling pattern used" },
  { pattern: /keep\s+it\s+simple/i, fix: "Define complexity thresholds or patterns to avoid" },
  { pattern: /follow\s+conventions/i, fix: "List the specific conventions" },
  { pattern: /be\s+consistent/i, fix: "Point to example files showing the desired pattern" },
  { pattern: /ensure\s+quality/i, fix: "Define specific quality criteria (test coverage, etc.)" },
  { pattern: /maintain\s+readability/i, fix: "Show an example of the preferred code style" },
  { pattern: /use\s+appropriate\s+naming/i, fix: "List naming conventions with examples" },
  { pattern: /handle\s+edge\s+cases/i, fix: "List the specific edge cases to handle" }
];
var vagueRule = {
  id: "vague",
  severity: "warning",
  description: "Instructions too vague to be actionable",
  run(ctx) {
    const results = [];
    for (const { pattern, fix } of VAGUE_PATTERNS) {
      const match = ctx.content.match(pattern);
      if (match) {
        const lineNum = ctx.content.substring(0, ctx.content.indexOf(match[0])).split("\n").length;
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `"${match[0].trim()}" is too vague to be actionable for Claude.`,
          line: lineNum,
          fix
        });
      }
    }
    return results;
  }
};

// src/linter/rules/redundant.ts
var redundantRule = {
  id: "redundant",
  severity: "warning",
  description: "Information Claude can infer from project files",
  run(ctx) {
    const results = [];
    if (ctx.stackLanguage === "typescript" && /use\s+typescript/i.test(ctx.content)) {
      results.push({
        ruleId: this.id,
        severity: "warning",
        message: '"Use TypeScript" \u2014 Claude can infer this from tsconfig.json. Remove to save tokens.',
        fix: "Remove this line."
      });
    }
    if (ctx.stackLanguage === "python" && /use\s+python/i.test(ctx.content)) {
      results.push({
        ruleId: this.id,
        severity: "warning",
        message: '"Use Python" \u2014 Claude can infer this from pyproject.toml/requirements.txt.',
        fix: "Remove this line."
      });
    }
    if (ctx.stackFramework === "rails" && /this\s+is\s+a\s+rails/i.test(ctx.content)) {
      results.push({
        ruleId: this.id,
        severity: "warning",
        message: '"This is a Rails..." \u2014 Claude can infer this from Gemfile. Remove to save tokens.',
        fix: "Remove this line."
      });
    }
    if (/use\s+esm/i.test(ctx.content) && /type.*module/i.test(ctx.content)) {
      results.push({
        ruleId: this.id,
        severity: "warning",
        message: '"Use ESM" \u2014 Claude can see "type": "module" in package.json.',
        fix: "Remove this line."
      });
    }
    return results;
  }
};

// src/linter/rules/no-architecture.ts
var noArchitectureRule = {
  id: "no-architecture",
  severity: "warning",
  description: "Missing architecture/project structure section",
  run(ctx) {
    const hasArchSection = /##\s*(architecture|project\s+structure|file\s+structure|directory|codebase\s+layout)/i.test(ctx.content);
    if (!hasArchSection) {
      return [{
        ruleId: this.id,
        severity: "warning",
        message: "No architecture/structure section found. Claude navigates better with a project map.",
        fix: "Add a '## Architecture' section listing key directories and their purposes."
      }];
    }
    return [];
  }
};

// src/linter/rules/missing-gotchas.ts
var missingGotchasRule = {
  id: "missing-gotchas",
  severity: "suggestion",
  description: "Missing gotchas/pitfalls section",
  run(ctx) {
    const hasGotchas = /##\s*(gotchas|don'?t|avoid|pitfalls|warnings|common\s+mistakes)/i.test(ctx.content);
    if (!hasGotchas) {
      return [{
        ruleId: this.id,
        severity: "suggestion",
        message: "No gotchas/pitfalls section. This prevents Claude from making known mistakes.",
        fix: "Add a '## Gotchas' section with DON'T rules for auto-generated files, common errors, etc."
      }];
    }
    return [];
  }
};

// src/linter/rules/no-imports.ts
var noImportsRule = {
  id: "no-imports",
  severity: "suggestion",
  description: "Large projects should use @import structure",
  run(ctx) {
    const hasImports = /@import\s/.test(ctx.content);
    if (!hasImports && ctx.estimatedTokens > 2e3) {
      return [{
        ruleId: this.id,
        severity: "suggestion",
        message: "Large CLAUDE.md without @import structure. Subdirectory CLAUDE.md files keep context focused.",
        fix: "Run `claudemd generate --modular` to generate an @import structure."
      }];
    }
    return [];
  }
};

// src/linter/rules/missing-patterns.ts
var missingPatternsRule = {
  id: "missing-patterns",
  severity: "suggestion",
  description: "Missing key patterns section for frameworks that use conventions",
  run(ctx) {
    const hasPatterns = /##\s*(key\s+)?patterns/i.test(ctx.content);
    const conventionFrameworks = ["rails", "django", "laravel", "phoenix", "nextjs"];
    if (!hasPatterns && ctx.stackFramework && conventionFrameworks.includes(ctx.stackFramework)) {
      return [{
        ruleId: this.id,
        severity: "suggestion",
        message: `${ctx.stackFramework} is convention-heavy. A "Key Patterns" section helps Claude follow your project's specific conventions.`,
        fix: "Add a '## Key Patterns' section documenting your service objects, naming conventions, etc."
      }];
    }
    return [];
  }
};

// src/linter/rules/import-candidate.ts
var importCandidateRule = {
  id: "import-candidate",
  severity: "suggestion",
  description: "Identifies sections that could be moved to child CLAUDE.md via @import",
  run(ctx) {
    const results = [];
    if (ctx.estimatedTokens < 1500) return [];
    for (const section of ctx.sections) {
      const sectionTokens = Math.ceil(section.content.length / 4);
      if (sectionTokens > 500) {
        const dirMentions = section.content.match(/\/(src|app|lib|packages|modules)\//g);
        if (dirMentions && dirMentions.length >= 2) {
          results.push({
            ruleId: this.id,
            severity: "suggestion",
            message: `Section "${section.heading}" (${sectionTokens} tokens) references multiple directories. Consider splitting into per-directory CLAUDE.md files with @import.`,
            line: section.line,
            fix: "Move directory-specific content to child CLAUDE.md files and @import them."
          });
        }
      }
    }
    return results;
  }
};

// src/linter/rules/context-efficiency.ts
var contextEfficiencyRule = {
  id: "context-efficiency",
  severity: "suggestion",
  description: "Detects content that could be compressed without losing meaning",
  run(ctx) {
    const results = [];
    for (const section of ctx.sections) {
      const heading = section.heading.toLowerCase();
      if (heading.includes("command")) {
        const longDescriptions = section.content.match(/^.{100,}$/gm);
        if (longDescriptions && longDescriptions.length > 2) {
          results.push({
            ruleId: this.id,
            severity: "suggestion",
            message: `Section "${section.heading}" has verbose command descriptions. Use a compact table format with inline comments.`,
            line: section.line,
            fix: "Use `command  # description` format instead of multi-line explanations."
          });
        }
      }
      const lineCount = section.content.split("\n").filter((l) => l.trim()).length;
      const bulletCount = (section.content.match(/^\s*[-*]\s/gm) ?? []).length;
      const codeBlockCount = (section.content.match(/```/g) ?? []).length / 2;
      if (lineCount > 10 && bulletCount === 0 && codeBlockCount === 0) {
        results.push({
          ruleId: this.id,
          severity: "suggestion",
          message: `Section "${section.heading}" is prose-heavy. Bullet points and code blocks are more token-efficient and scannable.`,
          line: section.line,
          fix: "Convert prose to bullet points or structured markdown."
        });
      }
    }
    return results;
  }
};

// src/linter/rules/duplicate-content.ts
var duplicateContentRule = {
  id: "duplicate-content",
  severity: "warning",
  description: "Detects repeated content across sections",
  run(ctx) {
    const results = [];
    const seenPhrases = /* @__PURE__ */ new Map();
    for (const section of ctx.sections) {
      const lines = section.content.split("\n").map((l) => l.trim()).filter((l) => l.length > 20 && !l.startsWith("#") && !l.startsWith("```"));
      for (const line of lines) {
        const normalized = line.toLowerCase().replace(/\s+/g, " ");
        const existing = seenPhrases.get(normalized);
        if (existing && existing.heading !== section.heading) {
          results.push({
            ruleId: this.id,
            severity: "warning",
            message: `Duplicated content between "${existing.heading}" and "${section.heading}": "${line.slice(0, 60)}..."`,
            line: section.line,
            fix: "Remove the duplicate and keep it in the most relevant section."
          });
          break;
        }
        seenPhrases.set(normalized, { heading: section.heading, line: section.line });
      }
    }
    return results;
  }
};

// src/linter/index.ts
var ALL_RULES = [
  tokenBudgetRule,
  tokenBloatRule,
  missingVerifyRule,
  staleRefRule,
  styleVsLinterRule,
  vagueRule,
  redundantRule,
  noArchitectureRule,
  missingGotchasRule,
  noImportsRule,
  missingPatternsRule,
  importCandidateRule,
  contextEfficiencyRule,
  duplicateContentRule
];
function buildContext(content, rootDir, stackLanguage, stackFramework) {
  return {
    content,
    lines: content.split("\n"),
    rootDir,
    sections: parseSections(content),
    estimatedTokens: Math.ceil(content.length / 4),
    stackLanguage,
    stackFramework
  };
}
function runRules(ctx, opts) {
  const results = [];
  const overrides = opts?.overrides ?? {};
  const ruleFilter = opts?.rules ? new Set(opts.rules) : null;
  for (const rule of ALL_RULES) {
    if (ruleFilter && !ruleFilter.has(rule.id)) continue;
    if (overrides[rule.id] === "off") continue;
    const ruleResults = rule.run(ctx);
    const overrideSeverity = overrides[rule.id];
    if (overrideSeverity && overrideSeverity !== "off") {
      for (const r of ruleResults) {
        r.severity = overrideSeverity;
      }
    }
    results.push(...ruleResults);
  }
  return results;
}
function calculateScore(content, results) {
  const tokens = Math.ceil(content.length / 4);
  const errorCount = results.filter((r) => r.severity === "error").length;
  const warningCount = results.filter((r) => r.severity === "warning").length;
  let tokenEfficiency = 100;
  if (tokens < 100) tokenEfficiency = 30;
  else if (tokens < 300) tokenEfficiency = 60;
  else if (tokens > 4e3) tokenEfficiency = Math.max(20, 100 - (tokens - 3e3) / 50);
  else if (tokens > 3e3) tokenEfficiency = Math.max(50, 100 - (tokens - 3e3) / 30);
  const bloatResults = results.filter((r) => r.ruleId === "token-bloat");
  tokenEfficiency -= bloatResults.length * 10;
  let actionability = 80;
  const vagueCount = results.filter((r) => r.ruleId === "vague").length;
  const verifyMissing = results.some((r) => r.ruleId === "missing-verify");
  actionability -= vagueCount * 15;
  if (verifyMissing) actionability -= 25;
  let coverage = 100;
  if (results.some((r) => r.ruleId === "no-architecture")) coverage -= 20;
  if (results.some((r) => r.ruleId === "missing-gotchas")) coverage -= 15;
  if (results.some((r) => r.ruleId === "missing-verify")) coverage -= 20;
  if (results.some((r) => r.ruleId === "missing-patterns")) coverage -= 10;
  const sectionCount = (content.match(/^##\s/gm) ?? []).length;
  if (sectionCount < 3) coverage -= 20;
  let specificity = 90;
  const styleIssues = results.filter((r) => r.ruleId === "style-vs-linter").length;
  specificity -= vagueCount * 15;
  specificity -= styleIssues * 10;
  let freshness = 100;
  const staleRefs = results.filter((r) => r.ruleId === "stale-ref").length;
  freshness -= staleRefs * 20;
  let antiPatternFree = 100;
  antiPatternFree -= errorCount * 15;
  antiPatternFree -= warningCount * 5;
  antiPatternFree -= styleIssues * 10;
  const duplicates = results.filter((r) => r.ruleId === "duplicate-content").length;
  antiPatternFree -= duplicates * 10;
  return {
    tokenEfficiency: clamp(tokenEfficiency),
    actionability: clamp(actionability),
    coverage: clamp(coverage),
    specificity: clamp(specificity),
    freshness: clamp(freshness),
    antiPatternFree: clamp(antiPatternFree)
  };
}
function totalScore(breakdown) {
  return Math.round(
    (breakdown.tokenEfficiency + breakdown.actionability + breakdown.coverage + breakdown.specificity + breakdown.freshness + breakdown.antiPatternFree) / 6
  );
}
function parseSections(content) {
  const sections = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentContent = "";
  let currentLine = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      if (currentHeading) {
        sections.push({ heading: currentHeading, content: currentContent, line: currentLine });
      }
      currentHeading = line.replace("## ", "").trim();
      currentContent = "";
      currentLine = i + 1;
    } else {
      currentContent += line + "\n";
    }
  }
  if (currentHeading) {
    sections.push({ heading: currentHeading, content: currentContent, line: currentLine });
  }
  return sections;
}
function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export {
  buildContext,
  runRules,
  calculateScore,
  totalScore
};
