#!/usr/bin/env node
import {
  analyzeCodebase,
  countTokens,
  detectStack
} from "../chunk-ALHWSAPL.js";
import {
  buildContext,
  calculateScore,
  runRules,
  totalScore
} from "../chunk-OWG3WG3R.js";

// src/cli/index.ts
import { Command } from "commander";

// src/cli/generate.ts
import { writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
async function generateCommand(opts) {
  const rootDir = process.cwd();
  const outputPath = resolve(rootDir, opts.output);
  console.log(chalk.bold("\n\u{1F50D} claudemd-pro \u2014 Analyzing codebase...\n"));
  const spinner = ora("Detecting stack...").start();
  const profile = await analyzeCodebase({
    rootDir,
    framework: opts.framework
  });
  spinner.succeed(
    `Detected: ${chalk.cyan(profile.stack.language)} / ${chalk.cyan(profile.stack.framework)} (${profile.architecture.totalFiles} files)`
  );
  spinner.start("Generating CLAUDE.md...");
  const content = renderClaudeMd(profile, opts);
  spinner.succeed("CLAUDE.md generated");
  const tokenEstimate = await countTokens(content);
  console.log(
    chalk.dim(`  Estimated tokens: ~${tokenEstimate} (${content.length} chars)`)
  );
  if (opts.dryRun) {
    console.log(chalk.yellow("\n\u2500\u2500\u2500 DRY RUN (not writing to disk) \u2500\u2500\u2500\n"));
    console.log(content);
    return;
  }
  if (opts.merge && existsSync(outputPath)) {
    console.log(
      chalk.yellow(
        `
\u26A0 Merge mode: ${outputPath} exists. Manual merge required.`
      )
    );
    const mergedPath = outputPath.replace(".md", ".generated.md");
    writeFileSync(mergedPath, content, "utf-8");
    console.log(chalk.green(`\u2713 Generated file written to: ${mergedPath}`));
    console.log(chalk.dim("  Diff it against your existing CLAUDE.md and merge manually."));
    return;
  }
  writeFileSync(outputPath, content, "utf-8");
  console.log(chalk.green(`
\u2713 Written to: ${outputPath}`));
  console.log(
    chalk.dim("  Run `claudemd lint` to check effectiveness score.\n")
  );
}
function renderClaudeMd(profile, opts) {
  const { stack, architecture, commands, database, testing, gotchas, environment, cicd, gitHistory } = profile;
  const sections = [];
  const projectName = getProjectName(profile.rootDir);
  sections.push(`# ${projectName}
`);
  const context = [];
  if (stack.language !== "unknown") {
    const lang = stack.languageVersion ? `${capitalize(stack.language)} ${stack.languageVersion}` : capitalize(stack.language);
    context.push(`- ${lang}`);
  }
  if (stack.framework !== "unknown") {
    const fw = stack.frameworkVersion ? `${capitalize(stack.framework)} ${stack.frameworkVersion}` : capitalize(stack.framework);
    context.push(`- Framework: ${fw}`);
  }
  if (database.adapter) {
    const dbLine = database.orm ? `${capitalize(database.adapter)} with ${database.orm}` : capitalize(database.adapter);
    context.push(`- Database: ${dbLine}${database.tableCount ? ` (${database.tableCount} tables)` : ""}`);
  }
  if (testing.framework) {
    context.push(`- Testing: ${testing.framework}${testing.coverageTool ? ` + ${testing.coverageTool}` : ""}`);
  }
  const notableDeps = getNotableDeps(stack);
  if (notableDeps.length > 0) {
    context.push(`- Key dependencies: ${notableDeps.join(", ")}`);
  }
  if (context.length > 0) {
    sections.push(`## Critical Context
${context.join("\n")}
`);
  }
  if (commands.commands.length > 0) {
    const cmdLines = [];
    const byCategory = groupBy(commands.commands, (c) => c.category);
    const order = [
      "dev",
      "test",
      "lint",
      "db",
      "build",
      "deploy",
      "other"
    ];
    for (const cat of order) {
      const cmds = byCategory[cat];
      if (!cmds?.length) continue;
      for (const cmd of cmds.slice(0, 4)) {
        const padded = cmd.command.padEnd(35);
        cmdLines.push(`${padded} # ${cmd.description}`);
      }
    }
    if (cmdLines.length > 0) {
      sections.push(`## Commands
\`\`\`
${cmdLines.join("\n")}
\`\`\`
`);
    }
  }
  if (architecture.topLevelDirs.length > 0) {
    const dirLines = architecture.topLevelDirs.filter((d) => d.fileCount > 0).slice(0, 15).map((d) => {
      const padded = `/${d.path}/`.padEnd(30);
      return `${padded} # ${d.purpose} (${d.fileCount} files)`;
    });
    sections.push(`## Architecture
\`\`\`
${dirLines.join("\n")}
\`\`\`
`);
  }
  if (architecture.patterns.length > 0) {
    const patternLines = architecture.patterns.map((p) => `- ${p}`);
    sections.push(`## Key Patterns
${patternLines.join("\n")}
`);
  }
  if (gotchas.gotchas.length > 0) {
    const gotchaLines = gotchas.gotchas.map((g) => `- ${g.rule} \u2014 ${g.reason}`);
    sections.push(`## Gotchas \u2014 DON'T Do This
${gotchaLines.join("\n")}
`);
  }
  if (environment.envVars.length > 0) {
    const criticalEnvVars = environment.envVars.filter((e) => !e.hasDefault).slice(0, 10);
    if (criticalEnvVars.length > 0) {
      const envLines = criticalEnvVars.map((e) => `- \`${e.name}\` (required, no default)`);
      sections.push(`## Required Environment Variables
${envLines.join("\n")}
`);
    }
  }
  if (cicd.provider) {
    sections.push(
      `## CI/CD
- Provider: ${cicd.provider}
- Workflows: ${cicd.workflowFiles.join(", ")}
`
    );
  }
  if (gitHistory?.insights?.length > 0) {
    const insightLines = gitHistory.insights.filter((i) => i.severity === "important").slice(0, 5).map((i) => `- ${i.message}`);
    if (insightLines.length > 0) {
      sections.push(`## Hotspots (from git history)
${insightLines.join("\n")}
`);
    }
  }
  if (opts.modular && architecture.estimatedSize === "large" && architecture.topLevelDirs.length > 8) {
    const importCandidates = architecture.topLevelDirs.filter((d) => d.fileCount > 20).slice(0, 5);
    if (importCandidates.length > 0) {
      const importLines = importCandidates.map(
        (d) => `@import ./${d.path}/CLAUDE.md   # ${d.purpose}`
      );
      sections.push(`## Module Context (create child CLAUDE.md files)
${importLines.join("\n")}
`);
    }
  }
  return sections.join("\n");
}
function getProjectName(rootDir) {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(rootDir, "package.json"), "utf-8")
    );
    if (pkg.name) return pkg.name;
  } catch {
  }
  return rootDir.split("/").pop() ?? "Project";
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function groupBy(arr, fn) {
  return arr.reduce(
    (acc, item) => {
      const key = fn(item);
      (acc[key] ??= []).push(item);
      return acc;
    },
    {}
  );
}
function getNotableDeps(stack) {
  const notable = [];
  const deps = stack.keyDeps;
  if (stack.framework === "rails") {
    if (deps["devise"]) notable.push("Devise (auth)");
    if (deps["pundit"]) notable.push("Pundit (authorization)");
    if (deps["sidekiq"]) notable.push("Sidekiq (jobs)");
    if (deps["good_job"]) notable.push("GoodJob (jobs)");
    if (deps["solid_queue"]) notable.push("SolidQueue (jobs)");
    if (deps["turbo-rails"]) notable.push("Turbo");
    if (deps["stimulus-rails"]) notable.push("Stimulus");
    if (deps["view_component"]) notable.push("ViewComponent");
    if (deps["pagy"]) notable.push("Pagy (pagination)");
    if (deps["kaminari"]) notable.push("Kaminari (pagination)");
    if (deps["ransack"]) notable.push("Ransack (search)");
    if (deps["pg_search"]) notable.push("pg_search");
    if (deps["stripe"]) notable.push("Stripe");
  }
  if (stack.language === "typescript" || stack.language === "javascript") {
    if (deps["tailwindcss"]) notable.push("Tailwind CSS");
    if (deps["@auth/core"] || deps["next-auth"]) notable.push("Auth.js");
    if (deps["stripe"]) notable.push("Stripe");
    if (deps["@tanstack/react-query"]) notable.push("TanStack Query");
    if (deps["zustand"]) notable.push("Zustand");
    if (deps["zod"]) notable.push("Zod (validation)");
    if (deps["@trpc/server"]) notable.push("tRPC");
    if (deps["shadcn-ui"] || deps["@radix-ui/react-dialog"]) notable.push("shadcn/ui");
    if (deps["drizzle-orm"]) notable.push("Drizzle ORM");
  }
  if (stack.language === "python") {
    if (deps["celery"]) notable.push("Celery (tasks)");
    if (deps["djangorestframework"]) notable.push("DRF (API)");
    if (deps["django-allauth"]) notable.push("django-allauth (auth)");
    if (deps["django-ninja"]) notable.push("Django Ninja (API)");
    if (deps["sqlalchemy"]) notable.push("SQLAlchemy");
    if (deps["alembic"]) notable.push("Alembic (migrations)");
    if (deps["pydantic"]) notable.push("Pydantic");
    if (deps["redis"]) notable.push("Redis");
    if (deps["boto3"]) notable.push("AWS SDK");
  }
  if (stack.language === "php") {
    if (deps["laravel/sanctum"]) notable.push("Sanctum (API auth)");
    if (deps["laravel/horizon"]) notable.push("Horizon (queues)");
    if (deps["livewire/livewire"]) notable.push("Livewire");
    if (deps["inertiajs/inertia-laravel"]) notable.push("Inertia.js");
    if (deps["spatie/laravel-permission"]) notable.push("Spatie Permissions");
    if (deps["laravel/nova"]) notable.push("Nova (admin)");
  }
  if (stack.language === "go") {
    if (deps["gorm.io/gorm"]) notable.push("GORM");
    if (deps["github.com/jmoiron/sqlx"]) notable.push("sqlx");
    if (deps["github.com/redis/go-redis"]) notable.push("Redis");
    if (deps["github.com/nats-io/nats.go"]) notable.push("NATS");
    if (deps["go.uber.org/zap"]) notable.push("Zap (logging)");
    if (deps["github.com/google/wire"]) notable.push("Wire (DI)");
  }
  if (stack.language === "rust") {
    if (deps["diesel"]) notable.push("Diesel (ORM)");
    if (deps["sqlx"]) notable.push("SQLx");
    if (deps["sea-orm"]) notable.push("SeaORM");
    if (deps["tokio"]) notable.push("Tokio (async runtime)");
    if (deps["serde"]) notable.push("Serde (serialization)");
    if (deps["tracing"]) notable.push("Tracing (observability)");
  }
  if (stack.language === "elixir") {
    if (deps["oban"]) notable.push("Oban (job processing)");
    if (deps["absinthe"]) notable.push("Absinthe (GraphQL)");
    if (deps["phoenix_live_view"]) notable.push("LiveView");
    if (deps["swoosh"]) notable.push("Swoosh (email)");
  }
  return notable.slice(0, 8);
}

// src/cli/lint.ts
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "fs";
import { resolve as resolve2 } from "path";
import chalk2 from "chalk";

// src/config/index.ts
import { cosmiconfigSync } from "cosmiconfig";

// src/config/schema.ts
var DEFAULT_CONFIG = {
  preset: "default",
  maxTokens: 3e3,
  rules: {},
  exclude: [],
  modular: false,
  plugins: []
};

// src/config/index.ts
var MODULE_NAME = "claudemd";
function loadConfig(rootDir) {
  try {
    const explorer = cosmiconfigSync(MODULE_NAME, {
      searchPlaces: [
        `.${MODULE_NAME}rc`,
        `.${MODULE_NAME}rc.json`,
        `.${MODULE_NAME}rc.yaml`,
        `.${MODULE_NAME}rc.yml`,
        `${MODULE_NAME}.config.js`,
        `${MODULE_NAME}.config.ts`,
        `package.json`
      ]
    });
    const result = explorer.search(rootDir);
    if (result?.config) {
      return mergeConfig(DEFAULT_CONFIG, result.config);
    }
  } catch {
  }
  return { ...DEFAULT_CONFIG };
}
function mergeConfig(defaults, overrides) {
  return {
    ...defaults,
    ...overrides,
    rules: { ...defaults.rules, ...overrides.rules },
    exclude: [...defaults.exclude ?? [], ...overrides.exclude ?? []],
    plugins: [...defaults.plugins ?? [], ...overrides.plugins ?? []]
  };
}

// src/linter/presets/default.ts
var defaultPreset = {
  name: "default",
  description: "Balanced preset for most projects",
  rules: [
    "token-budget",
    "token-bloat",
    "missing-verify",
    "stale-ref",
    "style-vs-linter",
    "vague",
    "redundant",
    "no-architecture",
    "missing-gotchas",
    "no-imports",
    "missing-patterns",
    "import-candidate",
    "context-efficiency",
    "duplicate-content"
  ]
};

// src/linter/presets/strict.ts
var strictPreset = {
  name: "strict",
  description: "Maximum rigor \u2014 all suggestions promoted to warnings",
  rules: [
    "token-budget",
    "token-bloat",
    "missing-verify",
    "stale-ref",
    "style-vs-linter",
    "vague",
    "redundant",
    "no-architecture",
    "missing-gotchas",
    "no-imports",
    "missing-patterns",
    "import-candidate",
    "context-efficiency",
    "duplicate-content"
  ],
  overrides: {
    "missing-gotchas": "warning",
    "no-imports": "warning",
    "missing-patterns": "warning",
    "import-candidate": "warning",
    "context-efficiency": "warning"
  }
};

// src/linter/presets/lean.ts
var leanPreset = {
  name: "lean",
  description: "Minimal \u2014 only critical rules for small projects or early-stage repos",
  rules: [
    "token-budget",
    "missing-verify",
    "stale-ref",
    "vague",
    "no-architecture"
  ]
};

// src/cli/lint.ts
var PRESETS = {
  default: defaultPreset,
  strict: strictPreset,
  lean: leanPreset
};
async function lintCommand(file, opts) {
  const filePath = resolve2(process.cwd(), file);
  if (!existsSync2(filePath)) {
    console.error(chalk2.red(`\u2716 File not found: ${filePath}`));
    console.log(chalk2.dim("  Run `claudemd generate` to create one.\n"));
    process.exit(1);
  }
  const content = readFileSync2(filePath, "utf-8");
  const rootDir = process.cwd();
  const config = loadConfig(rootDir);
  const stack = await detectStack(rootDir);
  const presetName = opts.preset ?? config.preset ?? "default";
  const preset = PRESETS[presetName] ?? defaultPreset;
  const ctx = buildContext(content, rootDir, stack.language, stack.framework);
  const results = runRules(ctx, {
    rules: preset.rules,
    overrides: { ...preset.overrides, ...config.rules }
  });
  const score = calculateScore(content, results);
  const total = totalScore(score);
  if (opts.format === "json") {
    console.log(JSON.stringify({ score: total, breakdown: score, results, preset: presetName }, null, 2));
    return;
  }
  if (opts.format === "score") {
    console.log(`
${chalk2.bold("CLAUDE.md Effectiveness Score:")} ${colorScore(total)}/100
`);
    return;
  }
  const errors = results.filter((r) => r.severity === "error");
  const warnings = results.filter((r) => r.severity === "warning");
  const suggestions = results.filter((r) => r.severity === "suggestion");
  console.log("");
  console.log(chalk2.bold("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(chalk2.bold(`\u2551  CLAUDE.md Effectiveness Score: ${colorScore(total)}/100${" ".repeat(Math.max(0, 15 - total.toString().length))}\u2551`));
  console.log(chalk2.bold("\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(`\u2551                                                      \u2551`);
  console.log(`\u2551  Token Efficiency    ${renderBar(score.tokenEfficiency)}  ${padNum(score.tokenEfficiency)}/100  \u2551`);
  console.log(`\u2551  Actionability       ${renderBar(score.actionability)}  ${padNum(score.actionability)}/100  \u2551`);
  console.log(`\u2551  Coverage            ${renderBar(score.coverage)}  ${padNum(score.coverage)}/100  \u2551`);
  console.log(`\u2551  Specificity         ${renderBar(score.specificity)}  ${padNum(score.specificity)}/100  \u2551`);
  console.log(`\u2551  Freshness           ${renderBar(score.freshness)}  ${padNum(score.freshness)}/100  \u2551`);
  console.log(`\u2551  Anti-Pattern Free   ${renderBar(score.antiPatternFree)}  ${padNum(score.antiPatternFree)}/100  \u2551`);
  console.log(`\u2551                                                      \u2551`);
  console.log(chalk2.bold("\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(
    chalk2.bold(
      `\u2551  ${errors.length} errors \xB7 ${warnings.length} warnings \xB7 ${suggestions.length} suggestions${" ".repeat(
        Math.max(0, 23 - `${errors.length}${warnings.length}${suggestions.length}`.length)
      )}\u2551`
    )
  );
  if (presetName !== "default") {
    console.log(chalk2.bold(`\u2551  Preset: ${presetName}${" ".repeat(Math.max(0, 43 - presetName.length))}\u2551`));
  }
  console.log(chalk2.bold("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  if (errors.length > 0) {
    console.log(chalk2.red.bold("\nERRORS:"));
    for (const r of errors) {
      const loc = r.line ? ` Line ${r.line}:` : "";
      console.log(chalk2.red(`  \u2716 [${r.ruleId}]${loc} ${r.message}`));
      if (r.fix && opts.fix) {
        console.log(chalk2.green(`    \u2192 Fix: ${r.fix}`));
      }
    }
  }
  if (warnings.length > 0) {
    console.log(chalk2.yellow.bold("\nWARNINGS:"));
    for (const r of warnings) {
      const loc = r.line ? ` Line ${r.line}:` : "";
      console.log(chalk2.yellow(`  \u26A0 [${r.ruleId}]${loc} ${r.message}`));
      if (r.fix && opts.fix) {
        console.log(chalk2.green(`    \u2192 Fix: ${r.fix}`));
      }
    }
  }
  if (suggestions.length > 0) {
    console.log(chalk2.cyan.bold("\nSUGGESTIONS:"));
    for (const r of suggestions) {
      const loc = r.line ? ` Line ${r.line}:` : "";
      console.log(chalk2.cyan(`  \u{1F4A1} [${r.ruleId}]${loc} ${r.message}`));
      if (r.fix && opts.fix) {
        console.log(chalk2.green(`    \u2192 Fix: ${r.fix}`));
      }
    }
  }
  console.log("");
  if (opts.strict && (errors.length > 0 || warnings.length > 0)) {
    process.exit(1);
  } else if (errors.length > 0) {
    process.exit(1);
  }
}
function renderBar(score) {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  if (score >= 80) return chalk2.green(bar);
  if (score >= 50) return chalk2.yellow(bar);
  return chalk2.red(bar);
}
function colorScore(score) {
  if (score >= 80) return chalk2.green.bold(score.toString());
  if (score >= 50) return chalk2.yellow.bold(score.toString());
  return chalk2.red.bold(score.toString());
}
function padNum(n) {
  return n.toString().padStart(2, " ");
}

// src/cli/budget.ts
import { readFileSync as readFileSync3, existsSync as existsSync3 } from "fs";
import { resolve as resolve3 } from "path";
import chalk3 from "chalk";
async function budgetCommand(file, opts) {
  const filePath = resolve3(process.cwd(), file);
  if (!existsSync3(filePath)) {
    console.error(chalk3.red(`\u2716 File not found: ${filePath}`));
    process.exit(1);
  }
  const content = readFileSync3(filePath, "utf-8");
  const maxTokens = parseInt(opts.maxTokens ?? "3000", 10);
  const sections = parseSections(content);
  const totalTokens = await countTokens(content);
  console.log(chalk3.bold("\nCLAUDE.md Token Budget Analysis"));
  console.log("\u2501".repeat(50));
  console.log(
    `Total tokens: ${colorTokens(totalTokens, maxTokens)} (${content.length} chars)`
  );
  console.log(`Budget:       ${maxTokens} tokens`);
  console.log(
    `Status:       ${totalTokens <= maxTokens ? chalk3.green("\u2713 Within budget") : chalk3.red("\u2716 Over budget by " + (totalTokens - maxTokens))}`
  );
  console.log(chalk3.bold("\nBreakdown by section:"));
  const preambleEnd = content.indexOf("\n## ");
  if (preambleEnd > 0) {
    const preamble = content.substring(0, preambleEnd);
    const preambleTokens = await countTokens(preamble);
    const pct = Math.round(preambleTokens / totalTokens * 100);
    printBar("Header/Preamble", preambleTokens, totalTokens, pct);
  }
  for (const section of sections) {
    const sectionTokens = await countTokens(section.content);
    const pct = Math.round(sectionTokens / totalTokens * 100);
    const warning = pct > 25 ? " \u26A0\uFE0F" : "";
    printBar(`${section.heading}${warning}`, sectionTokens, totalTokens, pct);
  }
  if (opts.optimize) {
    console.log(chalk3.bold("\nOptimization Recommendations:"));
    let potentialSavings = 0;
    for (const section of sections) {
      const lower = section.heading.toLowerCase();
      const sectionTokens = await countTokens(section.content);
      if (lower.includes("style") || lower.includes("formatting") || lower.includes("code conventions")) {
        console.log(
          chalk3.yellow(
            `  \u2192 Remove "${section.heading}" (-${sectionTokens} tokens). Use a linter instead.`
          )
        );
        potentialSavings += sectionTokens;
      }
      if (sectionTokens > 500) {
        const savings = Math.round(sectionTokens * 0.6);
        console.log(
          chalk3.cyan(
            `  \u2192 Move "${section.heading}" to @import (-${savings} tokens from root)`
          )
        );
        potentialSavings += savings;
      }
    }
    if (potentialSavings > 0) {
      const optimized = totalTokens - potentialSavings;
      const pctSaved = Math.round(potentialSavings / totalTokens * 100);
      console.log(
        chalk3.green(
          `
  Optimized total: ~${optimized} tokens (${pctSaved}% reduction)`
        )
      );
    } else {
      console.log(chalk3.green("  No major optimizations found. Looking good!"));
    }
  }
  console.log("");
}
function parseSections(content) {
  const sections = [];
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
function colorTokens(tokens, max) {
  const str = `~${tokens}`;
  if (tokens > max) return chalk3.red.bold(str);
  if (tokens > max * 0.8) return chalk3.yellow.bold(str);
  return chalk3.green.bold(str);
}
function printBar(label, tokens, total, pct) {
  const barWidth = 10;
  const filled = Math.round(pct / 100 * barWidth);
  const empty = barWidth - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  const coloredBar = pct > 25 ? chalk3.red(bar) : pct > 15 ? chalk3.yellow(bar) : chalk3.green(bar);
  const paddedLabel = label.padEnd(25);
  console.log(`  ${paddedLabel} ${coloredBar}  ${tokens} tokens (${pct}%)`);
}

// src/cli/evolve.ts
import { existsSync as existsSync5, readFileSync as readFileSync5, writeFileSync as writeFileSync2 } from "fs";
import { resolve as resolve5 } from "path";
import chalk4 from "chalk";

// src/evolve/index.ts
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "fs";
import { join, resolve as resolve4 } from "path";
function parseSections2(content) {
  const sections = [];
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
async function detectDrift(rootDir, claudeMdPath) {
  const content = readFileSync4(claudeMdPath, "utf-8");
  const sections = parseSections2(content);
  const profile = await analyzeCodebase({ rootDir });
  const driftItems = [];
  driftItems.push(...detectStalePaths(content, rootDir));
  driftItems.push(...detectMissingDirs(content, sections, profile.architecture));
  driftItems.push(...detectChangedCommands(content, sections, profile.commands, profile.stack));
  driftItems.push(...detectNewDeps(content, profile.stack));
  driftItems.push(...detectRemovedDeps(content, profile.stack));
  driftItems.push(...detectFrameworkChanges(content, profile.stack));
  driftItems.push(...detectMissingGotchas(content, sections, profile.gotchas));
  const currentScore = calculateDriftScore(driftItems);
  const estimatedScoreAfterFix = estimateFixedScore(driftItems);
  return {
    driftItems,
    currentScore,
    estimatedScoreAfterFix,
    lastAnalyzed: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function detectStalePaths(content, rootDir) {
  const items = [];
  const pathPattern = /(?:^|\s|`)(\/?(?:src|app|lib|config|test|tests|spec|db|prisma|public|scripts|packages)\/[a-zA-Z0-9_\-./]*)\/?(?:\s|$|`)/gm;
  let match;
  while ((match = pathPattern.exec(content)) !== null) {
    const refPath = match[1].replace(/^\//, "").replace(/\/+$/, "");
    if (!refPath || refPath.length < 3) continue;
    const fsPath = resolve4(rootDir, refPath);
    if (!existsSync4(fsPath)) {
      items.push({
        type: "stale-path",
        severity: "critical",
        message: `Referenced path \`/${refPath}/\` no longer exists on disk.`,
        suggestion: `Remove or update the reference to \`/${refPath}/\` in your CLAUDE.md.`,
        autoFix: {
          section: "Architecture",
          oldText: `/${refPath}/`
        }
      });
    }
  }
  return items;
}
function detectMissingDirs(content, sections, architecture) {
  const items = [];
  const significantDirs = architecture.topLevelDirs.filter(
    (d) => d.fileCount >= 3
  );
  for (const dir of significantDirs) {
    const dirName = dir.path.replace(/\/$/, "");
    const patterns = [
      `/${dirName}/`,
      `/${dirName} `,
      `/${dirName}\``,
      `${dirName}/`
    ];
    const mentioned = patterns.some((p) => content.includes(p));
    if (!mentioned) {
      items.push({
        type: "missing-dir",
        severity: "warning",
        message: `Directory \`/${dir.path}/\` (${dir.fileCount} files \u2014 ${dir.purpose}) is not documented.`,
        suggestion: `Add \`/${dir.path}/\` to the Architecture section with its purpose.`,
        autoFix: {
          section: "Architecture",
          newText: `/${dir.path.padEnd(28)}# ${dir.purpose} (${dir.fileCount} files)`
        }
      });
    }
  }
  return items;
}
function detectChangedCommands(content, sections, commands, stack) {
  const items = [];
  const pkgPath = join(process.cwd(), "package.json");
  if (!existsSync4(pkgPath)) return items;
  let currentScripts;
  try {
    const pkg = JSON.parse(readFileSync4(pkgPath, "utf-8"));
    currentScripts = pkg.scripts ?? {};
  } catch {
    return items;
  }
  const pm = stack.packageManager ?? "npm";
  const commandsSection = sections.find(
    (s) => s.heading.toLowerCase().includes("command")
  );
  if (!commandsSection) return items;
  for (const [name, cmd] of Object.entries(currentScripts)) {
    const fullCommand = `${pm} run ${name}`;
    const isReferenced = commandsSection.content.includes(fullCommand) || commandsSection.content.includes(`run ${name}`) || commandsSection.content.includes(`"${name}"`);
    if (!isReferenced) {
      items.push({
        type: "changed-command",
        severity: "info",
        message: `Script \`${pm} run ${name}\` exists in package.json but is not in the Commands section.`,
        suggestion: `Add \`${fullCommand}\` to the Commands section.`,
        autoFix: {
          section: "Commands",
          newText: `${fullCommand.padEnd(35)} # Run ${name}`
        }
      });
    }
  }
  const scriptRefPattern = new RegExp(`${pm}\\s+run\\s+([a-zA-Z0-9:_-]+)`, "g");
  let refMatch;
  while ((refMatch = scriptRefPattern.exec(content)) !== null) {
    const scriptName = refMatch[1];
    if (!(scriptName in currentScripts)) {
      items.push({
        type: "changed-command",
        severity: "critical",
        message: `Command \`${pm} run ${scriptName}\` is referenced but no longer exists in package.json scripts.`,
        suggestion: `Remove or update the reference to \`${pm} run ${scriptName}\`.`
      });
    }
  }
  return items;
}
function detectNewDeps(content, stack) {
  const items = [];
  const significantDeps = {
    // JS/TS
    "next": "Next.js framework",
    "@remix-run/node": "Remix framework",
    "express": "Express server",
    "fastify": "Fastify server",
    "@prisma/client": "Prisma ORM",
    "drizzle-orm": "Drizzle ORM",
    "zod": "Zod validation",
    "@trpc/server": "tRPC",
    "@tanstack/react-query": "TanStack Query",
    "zustand": "Zustand state management",
    "@reduxjs/toolkit": "Redux Toolkit",
    "tailwindcss": "Tailwind CSS",
    "next-auth": "Auth.js (NextAuth)",
    "stripe": "Stripe payments",
    "vitest": "Vitest testing",
    "jest": "Jest testing",
    "@playwright/test": "Playwright E2E testing",
    "cypress": "Cypress E2E testing",
    "msw": "Mock Service Worker",
    // Rails
    "devise": "Devise authentication",
    "pundit": "Pundit authorization",
    "sidekiq": "Sidekiq background jobs",
    "turbo-rails": "Hotwire Turbo",
    "stimulus-rails": "Stimulus controllers",
    "view_component": "ViewComponent"
  };
  const contentLower = content.toLowerCase();
  for (const [dep, description] of Object.entries(significantDeps)) {
    if (dep in stack.keyDeps) {
      const depNameLower = dep.toLowerCase().replace(/[@/]/g, "");
      const shortName = description.split(" ")[0].toLowerCase();
      const mentioned = contentLower.includes(dep.toLowerCase()) || contentLower.includes(depNameLower) || contentLower.includes(shortName);
      if (!mentioned) {
        items.push({
          type: "new-dep",
          severity: "warning",
          message: `Dependency \`${dep}\` (${description}) is installed but not mentioned in CLAUDE.md.`,
          suggestion: `Add ${description} to the Critical Context or Key Patterns section.`
        });
      }
    }
  }
  return items;
}
function detectRemovedDeps(content, stack) {
  const items = [];
  const depPatterns = [
    // Matches things like "Prisma ORM", "Tailwind CSS", "Zustand"
    { pattern: /\bPrisma\b/i, dep: "@prisma/client", name: "Prisma" },
    { pattern: /\bDrizzle\b/i, dep: "drizzle-orm", name: "Drizzle" },
    { pattern: /\bTailwind\b/i, dep: "tailwindcss", name: "Tailwind CSS" },
    { pattern: /\bZustand\b/i, dep: "zustand", name: "Zustand" },
    { pattern: /\bRedux\b/i, dep: "@reduxjs/toolkit", name: "Redux" },
    { pattern: /\btRPC\b/, dep: "@trpc/server", name: "tRPC" },
    { pattern: /\bTanStack\s*Query\b/i, dep: "@tanstack/react-query", name: "TanStack Query" },
    { pattern: /\bPlaywright\b/i, dep: "@playwright/test", name: "Playwright" },
    { pattern: /\bCypress\b/i, dep: "cypress", name: "Cypress" },
    { pattern: /\bSidekiq\b/i, dep: "sidekiq", name: "Sidekiq" },
    { pattern: /\bDevise\b/i, dep: "devise", name: "Devise" },
    { pattern: /\bPundit\b/i, dep: "pundit", name: "Pundit" },
    { pattern: /\bStripe\b/i, dep: "stripe", name: "Stripe" },
    { pattern: /\bVitest\b/i, dep: "vitest", name: "Vitest" },
    { pattern: /\bJest\b/i, dep: "jest", name: "Jest" },
    { pattern: /\bExpress\b/i, dep: "express", name: "Express" },
    { pattern: /\bFastify\b/i, dep: "fastify", name: "Fastify" }
  ];
  for (const { pattern, dep, name } of depPatterns) {
    if (pattern.test(content) && !(dep in stack.keyDeps)) {
      items.push({
        type: "removed-dep",
        severity: "critical",
        message: `CLAUDE.md references ${name} but \`${dep}\` is not installed.`,
        suggestion: `Remove references to ${name} from CLAUDE.md, or install the dependency if it was removed by mistake.`
      });
    }
  }
  return items;
}
function detectFrameworkChanges(content, stack) {
  const items = [];
  if (stack.framework === "unknown") return items;
  const frameworkName = capitalize2(stack.framework);
  const contentLower = content.toLowerCase();
  if (!contentLower.includes(stack.framework.toLowerCase())) {
    items.push({
      type: "framework-change",
      severity: "critical",
      message: `Current framework is ${frameworkName} but it is not mentioned in CLAUDE.md.`,
      suggestion: `Add ${frameworkName}${stack.frameworkVersion ? ` ${stack.frameworkVersion}` : ""} to the Critical Context section.`
    });
    return items;
  }
  if (stack.frameworkVersion) {
    const cleanVersion = stack.frameworkVersion.replace(/^[\^~>=<]+/, "");
    const versionMajor = cleanVersion.split(".")[0];
    const versionPatterns = [
      new RegExp(`${stack.framework}[\\s/]*(\\d+)`, "i"),
      new RegExp(`${frameworkName}[\\s/]*(\\d+)`, "i")
    ];
    for (const vp of versionPatterns) {
      const vMatch = content.match(vp);
      if (vMatch && vMatch[1] !== versionMajor) {
        items.push({
          type: "framework-change",
          severity: "warning",
          message: `CLAUDE.md references ${frameworkName} ${vMatch[1]} but the installed version is ${cleanVersion}.`,
          suggestion: `Update the version reference from ${frameworkName} ${vMatch[1]} to ${frameworkName} ${cleanVersion}.`,
          autoFix: {
            section: "Critical Context",
            oldText: `${vMatch[0]}`,
            newText: `${vMatch[0].replace(vMatch[1], versionMajor)}`
          }
        });
        break;
      }
    }
  }
  return items;
}
function detectMissingGotchas(content, sections, gotchas) {
  const items = [];
  for (const dir of gotchas.generatedDirs) {
    const dirName = dir.replace(/\/$/, "");
    if (!content.includes(dirName)) {
      items.push({
        type: "missing-gotcha",
        severity: "warning",
        message: `Auto-generated directory \`${dir}\` is not documented as a gotcha.`,
        suggestion: `Add "DON'T modify ${dir}" to the Gotchas section.`,
        autoFix: {
          section: "Gotchas",
          newText: `- DON'T modify ${dir} \u2014 auto-generated`
        }
      });
    }
  }
  for (const file of gotchas.generatedFiles) {
    if (!content.includes(file)) {
      items.push({
        type: "missing-gotcha",
        severity: "warning",
        message: `Auto-generated file \`${file}\` is not documented as a gotcha.`,
        suggestion: `Add "DON'T modify ${file} directly" to the Gotchas section.`,
        autoFix: {
          section: "Gotchas",
          newText: `- DON'T modify ${file} directly \u2014 auto-generated`
        }
      });
    }
  }
  for (const gotcha of gotchas.gotchas) {
    if (gotcha.severity !== "critical") continue;
    const ruleWords = gotcha.rule.replace(/DON'T\s+/i, "").split(/\s+/).slice(0, 3).join(" ").toLowerCase();
    if (!content.toLowerCase().includes(ruleWords)) {
      items.push({
        type: "missing-gotcha",
        severity: "info",
        message: `Critical gotcha not documented: "${gotcha.rule}"`,
        suggestion: `Add "${gotcha.rule} \u2014 ${gotcha.reason}" to the Gotchas section.`,
        autoFix: {
          section: "Gotchas",
          newText: `- ${gotcha.rule} \u2014 ${gotcha.reason}`
        }
      });
    }
  }
  return items;
}
function calculateDriftScore(items) {
  let score = 100;
  for (const item of items) {
    switch (item.severity) {
      case "critical":
        score -= 15;
        break;
      case "warning":
        score -= 7;
        break;
      case "info":
        score -= 2;
        break;
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
function estimateFixedScore(items) {
  const unfixable = items.filter((i) => !i.autoFix);
  return calculateDriftScore(unfixable);
}
function capitalize2(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// src/cli/evolve.ts
var SEVERITY_ICON = {
  critical: chalk4.red("\u2716"),
  warning: chalk4.yellow("\u26A0"),
  info: chalk4.cyan("\u2139")
};
var SEVERITY_COLOR = {
  critical: chalk4.red,
  warning: chalk4.yellow,
  info: chalk4.cyan
};
async function evolveCommand(file, opts) {
  const rootDir = process.cwd();
  const claudeMdPath = resolve5(rootDir, file);
  if (!existsSync5(claudeMdPath)) {
    console.error(chalk4.red(`\u2716 File not found: ${claudeMdPath}`));
    console.log(chalk4.dim("  Run `claudemd generate` to create one.\n"));
    process.exit(1);
  }
  const report = await detectDrift(rootDir, claudeMdPath);
  if (opts.format === "json") {
    console.log(JSON.stringify(report, null, 2));
    if (opts.ci) {
      exitForCi(report);
    }
    return;
  }
  renderReport(report);
  if (opts.apply) {
    applyFixes(claudeMdPath, report);
  }
  if (opts.ci) {
    exitForCi(report);
  }
}
function renderReport(report) {
  const { driftItems, currentScore, estimatedScoreAfterFix } = report;
  const criticalCount = driftItems.filter((i) => i.severity === "critical").length;
  const warningCount = driftItems.filter((i) => i.severity === "warning").length;
  const infoCount = driftItems.filter((i) => i.severity === "info").length;
  const fixableCount = driftItems.filter((i) => i.autoFix).length;
  console.log("");
  console.log(chalk4.bold("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(chalk4.bold(`\u2551  CLAUDE.md Drift Report                              \u2551`));
  console.log(chalk4.bold("\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(`\u2551                                                      \u2551`);
  console.log(`\u2551  Freshness Score     ${renderBar2(currentScore)}  ${padNum2(currentScore)}/100  \u2551`);
  if (fixableCount > 0) {
    console.log(`\u2551  After Auto-Fix      ${renderBar2(estimatedScoreAfterFix)}  ${padNum2(estimatedScoreAfterFix)}/100  \u2551`);
  }
  console.log(`\u2551                                                      \u2551`);
  console.log(chalk4.bold("\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(
    chalk4.bold(
      `\u2551  ${criticalCount} critical \xB7 ${warningCount} warnings \xB7 ${infoCount} info${" ".repeat(
        Math.max(0, 24 - `${criticalCount}${warningCount}${infoCount}`.length)
      )}\u2551`
    )
  );
  if (fixableCount > 0) {
    console.log(
      chalk4.bold(
        `\u2551  ${fixableCount} auto-fixable (run with --apply)${" ".repeat(
          Math.max(0, 24 - fixableCount.toString().length)
        )}\u2551`
      )
    );
  }
  console.log(chalk4.bold("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  if (driftItems.length === 0) {
    console.log(chalk4.green.bold("\n  Your CLAUDE.md is up to date!\n"));
    return;
  }
  const criticals = driftItems.filter((i) => i.severity === "critical");
  if (criticals.length > 0) {
    console.log(chalk4.red.bold("\nCRITICAL:"));
    for (const item of criticals) {
      printDriftItem(item);
    }
  }
  const warnings = driftItems.filter((i) => i.severity === "warning");
  if (warnings.length > 0) {
    console.log(chalk4.yellow.bold("\nWARNINGS:"));
    for (const item of warnings) {
      printDriftItem(item);
    }
  }
  const infos = driftItems.filter((i) => i.severity === "info");
  if (infos.length > 0) {
    console.log(chalk4.cyan.bold("\nINFO:"));
    for (const item of infos) {
      printDriftItem(item);
    }
  }
  console.log("");
}
function printDriftItem(item) {
  const icon = SEVERITY_ICON[item.severity];
  const color = SEVERITY_COLOR[item.severity];
  const fixTag = item.autoFix ? chalk4.dim(" [auto-fixable]") : "";
  console.log(color(`  ${icon} [${item.type}] ${item.message}${fixTag}`));
  console.log(chalk4.green(`    \u2192 ${item.suggestion}`));
}
function applyFixes(claudeMdPath, report) {
  const fixable = report.driftItems.filter((i) => i.autoFix);
  if (fixable.length === 0) {
    console.log(chalk4.dim("  No auto-fixable items.\n"));
    return;
  }
  let content = readFileSync5(claudeMdPath, "utf-8");
  let applied = 0;
  for (const item of fixable) {
    const fix = item.autoFix;
    if (fix.oldText && content.includes(fix.oldText)) {
      if (fix.newText) {
        content = content.replace(fix.oldText, fix.newText);
      } else {
        const lines = content.split("\n");
        content = lines.filter((l) => !l.includes(fix.oldText)).join("\n");
      }
      applied++;
    } else if (!fix.oldText && fix.newText) {
      content = appendToSection(content, fix.section, fix.newText);
      applied++;
    }
  }
  if (applied > 0) {
    writeFileSync2(claudeMdPath, content, "utf-8");
    console.log(chalk4.green.bold(`  Applied ${applied} auto-fix(es) to CLAUDE.md.`));
    console.log(chalk4.dim("  Review the changes and commit when ready.\n"));
  } else {
    console.log(chalk4.dim("  No fixes could be applied automatically.\n"));
  }
}
function appendToSection(content, sectionName, newText) {
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
    const sectionContent = lines.slice(sectionStart, sectionEnd).join("\n");
    if (sectionContent.includes("```")) {
      for (let i = sectionEnd - 1; i > sectionStart; i--) {
        if (lines[i].trim() === "```") {
          lines.splice(i, 0, newText);
          return lines.join("\n");
        }
      }
    }
    lines.splice(sectionEnd, 0, newText);
  } else {
    const sectionHeader = getSectionHeader(sectionName);
    lines.push("", sectionHeader, newText, "");
  }
  return lines.join("\n");
}
function getSectionHeader(sectionName) {
  const lowerName = sectionName.toLowerCase();
  if (lowerName.includes("gotcha")) return "## Gotchas \u2014 DON'T Do This";
  if (lowerName.includes("architecture")) return "## Architecture";
  if (lowerName.includes("command")) return "## Commands";
  if (lowerName.includes("context")) return "## Critical Context";
  return `## ${sectionName}`;
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function exitForCi(report) {
  const hasCriticalOrWarning = report.driftItems.some(
    (i) => i.severity === "critical" || i.severity === "warning"
  );
  if (hasCriticalOrWarning) {
    process.exit(1);
  }
}
function renderBar2(score) {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  if (score >= 80) return chalk4.green(bar);
  if (score >= 50) return chalk4.yellow(bar);
  return chalk4.red(bar);
}
function padNum2(n) {
  return n.toString().padStart(3, " ");
}

// src/cli/compare.ts
import { readFileSync as readFileSync6, existsSync as existsSync6 } from "fs";
import { resolve as resolve6 } from "path";
import chalk5 from "chalk";
async function compareCommand(fileA, fileB, opts) {
  const pathA = resolve6(process.cwd(), fileA);
  const pathB = resolve6(process.cwd(), fileB);
  if (!existsSync6(pathA)) {
    console.error(chalk5.red(`\u2716 File not found: ${pathA}`));
    process.exit(1);
  }
  if (!existsSync6(pathB)) {
    console.error(chalk5.red(`\u2716 File not found: ${pathB}`));
    process.exit(1);
  }
  const contentA = readFileSync6(pathA, "utf-8");
  const contentB = readFileSync6(pathB, "utf-8");
  const rootDir = process.cwd();
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
      improved: diff > 0
    }, null, 2));
    return;
  }
  console.log("");
  console.log(chalk5.bold("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
  console.log(chalk5.bold("\u2551          CLAUDE.md Before / After Comparison         \u2551"));
  console.log(chalk5.bold("\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  console.log(`\u2551                                                      \u2551`);
  console.log(`\u2551  Before: ${colorScore2(totalA)}/100   \u2192   After: ${colorScore2(totalB)}/100   ${formatDiff(diff)}${" ".repeat(Math.max(0, 8 - formatDiffLen(diff)))}\u2551`);
  console.log(`\u2551                                                      \u2551`);
  console.log(chalk5.bold("\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  const dimensions = [
    ["tokenEfficiency", "Token Efficiency"],
    ["actionability", "Actionability"],
    ["coverage", "Coverage"],
    ["specificity", "Specificity"],
    ["freshness", "Freshness"],
    ["antiPatternFree", "Anti-Pattern Free"]
  ];
  for (const [key, label] of dimensions) {
    const a = scoreA[key];
    const b = scoreB[key];
    const d = b - a;
    const padded = label.padEnd(20);
    const arrow = d > 0 ? chalk5.green(`+${d}`) : d < 0 ? chalk5.red(`${d}`) : chalk5.dim("=0");
    console.log(`\u2551  ${padded} ${String(a).padStart(3)} \u2192 ${String(b).padStart(3)}  ${arrow}${" ".repeat(Math.max(0, 14 - arrow.length + 10))}\u2551`);
  }
  console.log(`\u2551                                                      \u2551`);
  console.log(chalk5.bold("\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"));
  const errorsA = resultsA.filter((r) => r.severity === "error").length;
  const errorsB = resultsB.filter((r) => r.severity === "error").length;
  const warningsA = resultsA.filter((r) => r.severity === "warning").length;
  const warningsB = resultsB.filter((r) => r.severity === "warning").length;
  console.log(`\u2551  Errors:    ${errorsA} \u2192 ${errorsB}   Warnings: ${warningsA} \u2192 ${warningsB}${" ".repeat(Math.max(0, 18 - `${errorsA}${errorsB}${warningsA}${warningsB}`.length))}\u2551`);
  console.log(`\u2551  Tokens:    ~${Math.ceil(contentA.length / 4)} \u2192 ~${Math.ceil(contentB.length / 4)}${" ".repeat(Math.max(0, 33 - `${Math.ceil(contentA.length / 4)}${Math.ceil(contentB.length / 4)}`.length))}\u2551`);
  console.log(chalk5.bold("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
  const newIssueIds = new Set(resultsB.map((r) => r.ruleId));
  const oldIssueIds = new Set(resultsA.map((r) => r.ruleId));
  const resolved = resultsA.filter((r) => !newIssueIds.has(r.ruleId));
  const introduced = resultsB.filter((r) => !oldIssueIds.has(r.ruleId));
  if (resolved.length > 0) {
    console.log(chalk5.green.bold("\nResolved:"));
    for (const r of resolved) {
      console.log(chalk5.green(`  \u2713 [${r.ruleId}] ${r.message}`));
    }
  }
  if (introduced.length > 0) {
    console.log(chalk5.red.bold("\nNew issues:"));
    for (const r of introduced) {
      console.log(chalk5.red(`  \u2716 [${r.ruleId}] ${r.message}`));
    }
  }
  if (diff > 0) {
    console.log(chalk5.green.bold(`
\u2191 Score improved by ${diff} points`));
  } else if (diff < 0) {
    console.log(chalk5.red.bold(`
\u2193 Score decreased by ${Math.abs(diff)} points`));
  } else {
    console.log(chalk5.dim("\n= No change in overall score"));
  }
  console.log("");
}
function colorScore2(score) {
  if (score >= 80) return chalk5.green.bold(score.toString());
  if (score >= 50) return chalk5.yellow.bold(score.toString());
  return chalk5.red.bold(score.toString());
}
function formatDiff(diff) {
  if (diff > 0) return chalk5.green.bold(`(+${diff})`);
  if (diff < 0) return chalk5.red.bold(`(${diff})`);
  return chalk5.dim("(\xB10)");
}
function formatDiffLen(diff) {
  return `(${diff > 0 ? "+" : ""}${diff})`.length;
}

// src/cli/index.ts
var program = new Command();
program.name("claudemd").description(
  "Deep codebase-aware CLAUDE.md generator, linter, and effectiveness scorer"
).version("0.2.0");
program.command("generate").description("Analyze codebase and generate a battle-tested CLAUDE.md").option("-o, --output <path>", "Output file path", "./CLAUDE.md").option("-f, --framework <name>", "Force framework (auto-detected by default)").option("--modular", "Generate with @import structure for large projects").option("--monorepo", "Enable monorepo-aware generation").option("--merge", "Merge with existing CLAUDE.md instead of overwriting").option("--dry-run", "Preview output without writing to disk").action(generateCommand);
program.command("lint").description("Score your CLAUDE.md on effectiveness (not just structure)").argument("[file]", "Path to CLAUDE.md", "./CLAUDE.md").option("--fix", "Show auto-fix suggestions").option("--strict", "Fail on warnings too (useful for CI)").option("--format <type>", "Output format: text, json, score", "text").option("--preset <name>", "Rule preset: default, strict, lean").action(lintCommand);
program.command("budget").description("Show token breakdown and optimization suggestions").argument("[file]", "Path to CLAUDE.md", "./CLAUDE.md").option("--optimize", "Include token-saving suggestions").option("--max-tokens <n>", "Set a token ceiling", "3000").action(budgetCommand);
program.command("score").description("Quick effectiveness score (0-100)").argument("[file]", "Path to CLAUDE.md", "./CLAUDE.md").action(async (file) => {
  await lintCommand(file, { format: "score" });
});
program.command("evolve").description("Detect codebase drift and suggest CLAUDE.md updates").argument("[file]", "Path to CLAUDE.md", "./CLAUDE.md").option("--apply", "Auto-apply safe updates").option("--ci", "CI mode: exit 1 if drift detected").option("--format <type>", "Output format: text, json", "text").action(evolveCommand);
program.command("compare").description("Compare two CLAUDE.md files \u2014 before/after scoring").argument("<fileA>", "First CLAUDE.md (before)").argument("<fileB>", "Second CLAUDE.md (after)").option("--format <type>", "Output format: text, json", "text").action(compareCommand);
program.command("serve").description("Start MCP server for Claude Desktop / Claude Code integration").action(async () => {
  const { startMcpServer } = await import("../mcp/index.js");
  await startMcpServer();
});
program.parse();
