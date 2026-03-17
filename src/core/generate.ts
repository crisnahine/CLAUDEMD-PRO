/**
 * Core Generate Module
 *
 * Shared CLAUDE.md renderer used by both the CLI generate command and the
 * MCP server. Accepts a CodebaseProfile and returns a rendered string.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CodebaseProfile } from "../analyzers/index.js";
import type { StackProfile } from "../analyzers/stack-detector.js";

export interface RenderOptions {
  modular?: boolean;
}

/**
 * Render a complete CLAUDE.md string from a CodebaseProfile.
 */
export function renderClaudeMd(profile: CodebaseProfile, opts?: RenderOptions): string {
  const { stack, architecture, commands, database, testing, gotchas, environment, cicd, gitHistory, domains, style } = profile;
  const sections: string[] = [];

  // -- Header --
  const projectName = getProjectName(profile.rootDir);
  sections.push(`# ${projectName}\n`);

  // -- Critical Context --
  const context: string[] = [];
  if (stack.language !== "unknown") {
    const lang = stack.languageVersion
      ? `${capitalize(stack.language)} ${stack.languageVersion}`
      : capitalize(stack.language);
    context.push(`- ${lang}`);
    if (stack.runtimeVersion && stack.runtimeVersion !== stack.languageVersion) {
      context.push(`- Node.js ${stack.runtimeVersion}`);
    }
  }
  if (stack.framework !== "unknown") {
    const fw = stack.frameworkVersion
      ? `${capitalize(stack.framework)} ${stack.frameworkVersion}`
      : capitalize(stack.framework);
    context.push(`- Framework: ${fw}`);
  }
  if (database.adapter) {
    const dbLine = database.orm
      ? `${capitalize(database.adapter)} with ${database.orm}`
      : capitalize(database.adapter);
    const dbExtras: string[] = [];
    if (database.tableCount) dbExtras.push(`${database.tableCount} tables`);
    if (database.migrationCount) dbExtras.push(`${database.migrationCount} migrations`);
    context.push(`- Database: ${dbLine}${dbExtras.length ? ` (${dbExtras.join(", ")})` : ""}`);
    if (database.hasRedis) context.push(`- Cache: Redis`);
    if (database.hasNoSQL) context.push(`- NoSQL: MongoDB/document store detected`);
  }
  if (testing.framework) {
    const testExtras: string[] = [];
    if (testing.coverageTool) testExtras.push(testing.coverageTool);
    if (testing.estimatedTestCount && testing.estimatedTestCount > 0) testExtras.push(`~${testing.estimatedTestCount} tests`);
    context.push(`- Testing: ${testing.framework}${testExtras.length ? ` (${testExtras.join(", ")})` : ""}`);
  }

  // Add key deps that Claude should know about
  const notableDeps = getNotableDeps(stack);
  if (notableDeps.length > 0) {
    context.push(`- Key dependencies: ${notableDeps.join(", ")}`);
  }

  if (context.length > 0) {
    sections.push(`## Critical Context\n${context.join("\n")}\n`);
  }

  // -- Commands --
  if (commands.commands.length > 0) {
    const cmdLines: string[] = [];
    const byCategory = groupBy(commands.commands, (c) => c.category);

    // Prioritize: dev, test, lint, db, build, deploy, other
    const order: Array<typeof commands.commands[0]["category"]> = [
      "dev", "test", "lint", "db", "build", "deploy", "other",
    ];

    for (const cat of order) {
      const cmds = byCategory[cat];
      if (!cmds?.length) continue;
      for (const cmd of cmds.slice(0, 4)) {
        // Max 4 per category
        const padded = cmd.command.padEnd(35);
        cmdLines.push(`${padded} # ${cmd.description}`);
      }
    }

    if (cmdLines.length > 0) {
      sections.push(`## Commands\n\`\`\`\n${cmdLines.join("\n")}\n\`\`\`\n`);
    }
  }

  // -- Architecture --
  if (architecture.topLevelDirs.length > 0) {
    const dirLines = architecture.topLevelDirs
      .filter((d) => d.fileCount > 0)
      .slice(0, 15) // Cap at 15 most important dirs
      .map((d) => {
        const padded = `/${d.path}/`.padEnd(30);
        return `${padded} # ${d.purpose} (${d.fileCount} files)`;
      });

    sections.push(`## Architecture\n\`\`\`\n${dirLines.join("\n")}\n\`\`\`\n`);
  }

  // -- Key Patterns --
  if (architecture.patterns.length > 0) {
    const patternLines = architecture.patterns.map((p) => `- ${p}`);
    sections.push(`## Key Patterns\n${patternLines.join("\n")}\n`);
  }

  // -- What This App Does (Domain Deep Dive) --
  if (domains?.domains?.length > 0) {
    const domainLines: string[] = [];
    for (const domain of domains.domains) {
      let line = `- **${domain.name}**`;
      if (domain.entities.length > 0) {
        line += ` — entities: ${domain.entities.join(", ")}`;
      }
      if (domain.endpoints.length > 0) {
        line += ` (${domain.endpoints.slice(0, 3).join(", ")})`;
      }
      domainLines.push(line);
    }
    if (domains.entityCount > 0) {
      domainLines.push(`\n_${domains.entityCount} entities across ${domains.domains.length} domains_`);
    }
    sections.push(`## What This App Does\n${domainLines.join("\n")}\n`);
  }

  // -- Coding Conventions (Style Guide) --
  if (style?.conventions?.length > 0) {
    const styleLines = style.conventions.map((c) => `- **${c.category}:** ${c.pattern}`);
    sections.push(`## Coding Conventions\n${styleLines.join("\n")}\n`);
  }

  // -- Testing Details (only if rich signals exist) --
  if (testing.hasSnapshots || testing.hasPropertyTests || testing.hasComponentTests || testing.hasStorybook || testing.hasBenchmarks) {
    const testDetails: string[] = [];
    if (testing.testPattern) testDetails.push(`- Pattern: ${testing.testPattern}`);
    if (testing.hasSnapshots) testDetails.push(`- Snapshot tests in use`);
    if (testing.hasPropertyTests) testDetails.push(`- Property-based testing in use`);
    if (testing.hasComponentTests) testDetails.push(`- Component testing in use`);
    if (testing.hasStorybook) testDetails.push(`- Storybook for component development`);
    if (testing.hasBenchmarks) testDetails.push(`- Benchmarks configured`);
    if (database.schemaFile) testDetails.push(`- Schema file: \`${database.schemaFile}\``);
    if (testDetails.length > 0) {
      sections.push(`## Testing Details\n${testDetails.join("\n")}\n`);
    }
  }

  // -- Gotchas --
  if (gotchas.gotchas.length > 0) {
    const gotchaLines = gotchas.gotchas.map((g) => `- ${g.rule} — ${g.reason}`);
    sections.push(`## Gotchas — DON'T Do This\n${gotchaLines.join("\n")}\n`);
  }

  // -- Environment --
  if (environment.envVars.length > 0 || environment.secretManager) {
    const envSectionLines: string[] = [];

    // Secret manager
    if (environment.secretManager) {
      envSectionLines.push(`- Secret management: ${environment.secretManager}`);
    }

    // Typed env
    if (environment.hasTypedEnv) {
      envSectionLines.push(`- Typed environment: env.d.ts detected`);
    }

    // Required env vars
    const criticalEnvVars = environment.envVars
      .filter((e) => !e.hasDefault)
      .slice(0, 10);
    if (criticalEnvVars.length > 0) {
      envSectionLines.push(...criticalEnvVars.map((e) => `- \`${e.name}\` (required, no default)`));
    }

    // Variable groups summary
    if (environment.varGroups && Object.keys(environment.varGroups).length > 0) {
      const groupSummary = Object.entries(environment.varGroups)
        .map(([prefix, count]) => `${prefix} (${count})`)
        .join(", ");
      envSectionLines.push(`- Variable groups: ${groupSummary}`);
    }

    if (envSectionLines.length > 0) {
      sections.push(`## Environment\n${envSectionLines.join("\n")}\n`);
    }
  }

  // -- CI/CD --
  if (cicd.provider) {
    const ciLines: string[] = [];
    ciLines.push(`- Provider: ${cicd.provider}`);
    if (cicd.workflowFiles?.length > 0) {
      ciLines.push(`- Workflows: ${cicd.workflowFiles.join(", ")}`);
    }
    if (cicd.deployTarget) {
      ciLines.push(`- Deploy target: ${cicd.deployTarget}`);
    }
    if (cicd.hasDocker || environment.hasDocker) {
      ciLines.push(`- Docker: ${cicd.hasDockerCompose || environment.hasDockerCompose ? "Docker Compose" : "Dockerfile"} detected`);
    }
    if (cicd.triggers?.length > 0) {
      ciLines.push(`- Triggers: ${cicd.triggers.join(", ")}`);
    }
    sections.push(`## CI/CD\n${ciLines.join("\n")}\n`);
  }

  // -- Git Insights (high-churn hotspots, revert-prone files) --
  if (gitHistory?.insights?.length > 0) {
    const insightLines = gitHistory.insights
      .filter((i) => i.severity === "important")
      .slice(0, 5)
      .map((i) => `- ${i.message}`);
    if (insightLines.length > 0) {
      sections.push(`## Hotspots (from git history)\n${insightLines.join("\n")}\n`);
    }
  }

  // -- @import hints for large projects --
  if (
    opts?.modular &&
    architecture.estimatedSize === "large" &&
    architecture.topLevelDirs.length > 8
  ) {
    const importCandidates = architecture.topLevelDirs
      .filter((d) => d.fileCount > 20)
      .slice(0, 5);

    if (importCandidates.length > 0) {
      const importLines = importCandidates.map(
        (d) => `@import ./${d.path}/CLAUDE.md   # ${d.purpose}`
      );
      sections.push(`## Module Context (create child CLAUDE.md files)\n${importLines.join("\n")}\n`);
    }
  }

  return sections.join("\n");
}

// --- Helpers -------------------------------------------------------

export function getProjectName(rootDir: string): string {
  // Try package.json name first
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(rootDir, "package.json"), "utf-8")
    );
    if (pkg.name) return pkg.name;
  } catch { /* ignore */ }

  // Fall back to directory name
  return rootDir.split("/").pop() ?? "Project";
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const key = fn(item);
      (acc[key] ??= []).push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Extract notable dependencies that Claude should be aware of.
 * These are deps that affect how code should be written.
 */
export function getNotableDeps(stack: StackProfile): string[] {
  const notable: string[] = [];
  const deps = stack.keyDeps;

  // Rails notable gems
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

  // JS/TS notable deps
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

  // Python notable deps
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

  // PHP/Laravel notable deps
  if (stack.language === "php") {
    if (deps["laravel/sanctum"]) notable.push("Sanctum (API auth)");
    if (deps["laravel/horizon"]) notable.push("Horizon (queues)");
    if (deps["livewire/livewire"]) notable.push("Livewire");
    if (deps["inertiajs/inertia-laravel"]) notable.push("Inertia.js");
    if (deps["spatie/laravel-permission"]) notable.push("Spatie Permissions");
    if (deps["laravel/nova"]) notable.push("Nova (admin)");
  }

  // Go notable deps
  if (stack.language === "go") {
    if (deps["gorm.io/gorm"]) notable.push("GORM");
    if (deps["github.com/jmoiron/sqlx"]) notable.push("sqlx");
    if (deps["github.com/redis/go-redis"]) notable.push("Redis");
    if (deps["github.com/nats-io/nats.go"]) notable.push("NATS");
    if (deps["go.uber.org/zap"]) notable.push("Zap (logging)");
    if (deps["github.com/google/wire"]) notable.push("Wire (DI)");
  }

  // Rust notable deps
  if (stack.language === "rust") {
    if (deps["diesel"]) notable.push("Diesel (ORM)");
    if (deps["sqlx"]) notable.push("SQLx");
    if (deps["sea-orm"]) notable.push("SeaORM");
    if (deps["tokio"]) notable.push("Tokio (async runtime)");
    if (deps["serde"]) notable.push("Serde (serialization)");
    if (deps["tracing"]) notable.push("Tracing (observability)");
  }

  // Elixir notable deps
  if (stack.language === "elixir") {
    if (deps["oban"]) notable.push("Oban (job processing)");
    if (deps["absinthe"]) notable.push("Absinthe (GraphQL)");
    if (deps["phoenix_live_view"]) notable.push("LiveView");
    if (deps["swoosh"]) notable.push("Swoosh (email)");
  }

  return notable.slice(0, 8); // Don't overwhelm
}
