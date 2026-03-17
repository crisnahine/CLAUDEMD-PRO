/**
 * Commands Analyzer
 *
 * Extracts dev, test, build, lint, and deployment commands from
 * package.json scripts, Makefile, Rakefile, Procfile, etc.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { StackProfile } from "./stack-detector.js";

export interface CommandInfo {
  command: string;
  description: string;
  category: "dev" | "test" | "build" | "lint" | "db" | "deploy" | "other";
}

export interface CommandsProfile {
  commands: CommandInfo[];
  devServer: string | null;
  hasLinter: boolean;
  hasFormatter: boolean;
  hasTypecheck: boolean;
}

export async function analyzeCommands(
  rootDir: string,
  stack: StackProfile
): Promise<CommandsProfile> {
  const commands: CommandInfo[] = [];
  let devServer: string | null = null;
  let hasLinter = false;
  let hasFormatter = false;
  let hasTypecheck = false;

  // ── package.json scripts ──
  if (existsSync(join(rootDir, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8"));
      const scripts = pkg.scripts ?? {};

      for (const [name, cmd] of Object.entries(scripts)) {
        const command = `${stack.packageManager ?? "npm"} run ${name}`;
        const category = categorizeScript(name, cmd as string);

        if (category === "dev" && !devServer) devServer = command;
        if (name.includes("lint")) hasLinter = true;
        if (name.includes("format") || name.includes("prettier")) hasFormatter = true;
        if (name.includes("typecheck") || name.includes("tsc")) hasTypecheck = true;

        commands.push({
          command,
          description: describeScript(name, cmd as string),
          category,
        });
      }
    } catch { /* skip malformed package.json */ }
  }

  // ── Rails-specific ──
  if (stack.framework === "rails") {
    // Check for bin/dev (Procfile.dev)
    if (existsSync(join(rootDir, "bin/dev"))) {
      devServer = "bin/dev";
      commands.push({
        command: "bin/dev",
        description: "Start dev server (Procfile.dev)",
        category: "dev",
      });
    }

    commands.push(
      { command: "bin/rails test", description: "Run test suite", category: "test" },
      { command: "bin/rails db:migrate", description: "Run pending migrations", category: "db" },
      {
        command: "bin/rails db:migrate:status",
        description: "Check migration status",
        category: "db",
      },
    );

    // Check for RSpec
    if (existsSync(join(rootDir, "spec")) || stack.keyDeps["rspec-rails"]) {
      commands.push({
        command: "bundle exec rspec",
        description: "Run RSpec test suite",
        category: "test",
      });
    }

    // Check for RuboCop
    if (stack.keyDeps["rubocop"] || existsSync(join(rootDir, ".rubocop.yml"))) {
      hasLinter = true;
      commands.push({
        command: "bundle exec rubocop -a",
        description: "Lint & auto-fix Ruby code",
        category: "lint",
      });
    }

    // System tests
    if (existsSync(join(rootDir, "test/system")) || existsSync(join(rootDir, "spec/system"))) {
      commands.push({
        command: "bin/rails test:system",
        description: "Run system/integration tests",
        category: "test",
      });
    }
  }

  // ── Django ──
  if (stack.framework === "django") {
    if (existsSync(join(rootDir, "manage.py"))) {
      devServer = devServer ?? "python manage.py runserver";
      commands.push(
        { command: "python manage.py runserver", description: "Start Django dev server", category: "dev" },
        { command: "python manage.py test", description: "Run Django test suite", category: "test" },
        { command: "python manage.py migrate", description: "Run pending migrations", category: "db" },
        { command: "python manage.py makemigrations", description: "Create new migrations", category: "db" },
        { command: "python manage.py shell", description: "Django interactive shell", category: "other" },
      );
    }
    if (stack.keyDeps["ruff"] || existsSync(join(rootDir, "ruff.toml"))) {
      hasLinter = true;
      commands.push({ command: "ruff check .", description: "Run Ruff linter", category: "lint" });
    }
    if (stack.keyDeps["mypy"]) {
      hasTypecheck = true;
      commands.push({ command: "mypy .", description: "Run type checking", category: "lint" });
    }
    if (stack.keyDeps["pytest"]) {
      commands.push({ command: "pytest", description: "Run pytest suite", category: "test" });
    }
  }

  // ── FastAPI ──
  if (stack.framework === "fastapi") {
    devServer = devServer ?? "uvicorn app.main:app --reload";
    commands.push(
      { command: "uvicorn app.main:app --reload", description: "Start FastAPI dev server", category: "dev" },
    );
    if (existsSync(join(rootDir, "alembic.ini"))) {
      commands.push(
        { command: "alembic upgrade head", description: "Run Alembic migrations", category: "db" },
        { command: "alembic revision --autogenerate -m ''", description: "Create new migration", category: "db" },
      );
    }
    if (stack.keyDeps["pytest"]) {
      commands.push({ command: "pytest", description: "Run pytest suite", category: "test" });
    }
    if (stack.keyDeps["ruff"]) {
      hasLinter = true;
      commands.push({ command: "ruff check .", description: "Run Ruff linter", category: "lint" });
    }
  }

  // ── Flask ──
  if (stack.framework === "flask") {
    devServer = devServer ?? "flask run --debug";
    commands.push(
      { command: "flask run --debug", description: "Start Flask dev server", category: "dev" },
    );
    if (existsSync(join(rootDir, "migrations"))) {
      commands.push({ command: "flask db upgrade", description: "Run Flask-Migrate migrations", category: "db" });
    }
  }

  // ── Laravel ──
  if (stack.framework === "laravel") {
    devServer = devServer ?? "php artisan serve";
    commands.push(
      { command: "php artisan serve", description: "Start Laravel dev server", category: "dev" },
      { command: "php artisan test", description: "Run PHPUnit test suite", category: "test" },
      { command: "php artisan migrate", description: "Run pending migrations", category: "db" },
      { command: "php artisan migrate:status", description: "Check migration status", category: "db" },
      { command: "php artisan tinker", description: "Interactive REPL", category: "other" },
    );
    if (stack.keyDeps["laravel/pint"] || existsSync(join(rootDir, "pint.json"))) {
      hasLinter = true;
      hasFormatter = true;
      commands.push({ command: "./vendor/bin/pint", description: "Run Laravel Pint (code style)", category: "lint" });
    }
    if (stack.keyDeps["phpstan/phpstan"] || existsSync(join(rootDir, "phpstan.neon"))) {
      hasTypecheck = true;
      commands.push({ command: "./vendor/bin/phpstan analyse", description: "Run PHPStan static analysis", category: "lint" });
    }
  }

  // ── Phoenix / Elixir ──
  if (stack.framework === "phoenix") {
    devServer = devServer ?? "mix phx.server";
    commands.push(
      { command: "mix phx.server", description: "Start Phoenix dev server", category: "dev" },
      { command: "mix test", description: "Run ExUnit test suite", category: "test" },
      { command: "mix ecto.migrate", description: "Run Ecto migrations", category: "db" },
      { command: "mix ecto.gen.migration", description: "Generate new migration", category: "db" },
    );
    if (stack.keyDeps["credo"]) {
      hasLinter = true;
      commands.push({ command: "mix credo", description: "Run Credo static analysis", category: "lint" });
    }
    if (stack.keyDeps["dialyxir"]) {
      hasTypecheck = true;
      commands.push({ command: "mix dialyzer", description: "Run Dialyzer type checking", category: "lint" });
    }
  }

  // ── Go (Gin/Echo/Fiber) ──
  if (stack.language === "go") {
    devServer = devServer ?? "go run .";
    commands.push(
      { command: "go run .", description: "Run the application", category: "dev" },
      { command: "go test ./...", description: "Run all Go tests", category: "test" },
      { command: "go build -o bin/app .", description: "Build binary", category: "build" },
    );
    if (stack.keyDeps["github.com/cosmtrek/air"] || existsSync(join(rootDir, ".air.toml"))) {
      devServer = "air";
      commands.push({ command: "air", description: "Hot-reload dev server", category: "dev" });
    }
    if (existsSync(join(rootDir, ".golangci.yml")) || existsSync(join(rootDir, ".golangci.yaml"))) {
      hasLinter = true;
      commands.push({ command: "golangci-lint run", description: "Run Go linters", category: "lint" });
    }
  }

  // ── Rust ──
  if (stack.language === "rust") {
    devServer = devServer ?? "cargo run";
    commands.push(
      { command: "cargo run", description: "Build and run", category: "dev" },
      { command: "cargo test", description: "Run test suite", category: "test" },
      { command: "cargo build --release", description: "Release build", category: "build" },
      { command: "cargo clippy", description: "Run Clippy linter", category: "lint" },
      { command: "cargo fmt --check", description: "Check formatting", category: "lint" },
    );
    hasLinter = true;
    hasFormatter = true;
    if (existsSync(join(rootDir, "diesel.toml"))) {
      commands.push({ command: "diesel migration run", description: "Run Diesel migrations", category: "db" });
    }
  }

  // ── Java / Spring Boot ──
  if (stack.framework === "spring") {
    const isGradle = existsSync(join(rootDir, "gradlew"));
    const runner = isGradle ? "./gradlew" : "mvn";
    devServer = devServer ?? `${runner} ${isGradle ? "bootRun" : "spring-boot:run"}`;
    commands.push(
      { command: `${runner} ${isGradle ? "bootRun" : "spring-boot:run"}`, description: "Start Spring Boot dev server", category: "dev" },
      { command: `${runner} test`, description: "Run test suite", category: "test" },
      { command: `${runner} ${isGradle ? "build" : "package"}`, description: "Build application", category: "build" },
    );
  }

  // ── Makefile ──
  if (existsSync(join(rootDir, "Makefile"))) {
    const makefile = readFileSync(join(rootDir, "Makefile"), "utf-8");
    const targets = makefile.match(/^([a-zA-Z_-]+):/gm);
    if (targets) {
      for (const target of targets.slice(0, 10)) {
        // Limit to first 10
        const name = target.replace(":", "");
        commands.push({
          command: `make ${name}`,
          description: `Makefile target: ${name}`,
          category: categorizeScript(name, ""),
        });
      }
    }
  }

  return { commands, devServer, hasLinter, hasFormatter, hasTypecheck };
}

function categorizeScript(name: string, cmd: string): CommandInfo["category"] {
  const n = name.toLowerCase();
  const c = (cmd ?? "").toLowerCase();

  if (n.includes("dev") || n.includes("start") || n.includes("serve")) return "dev";
  if (n.includes("test") || n.includes("spec") || c.includes("jest") || c.includes("vitest"))
    return "test";
  if (n.includes("build") || n.includes("compile")) return "build";
  if (n.includes("lint") || n.includes("format") || n.includes("check")) return "lint";
  if (n.includes("migrate") || n.includes("seed") || n.includes("db")) return "db";
  if (n.includes("deploy") || n.includes("release")) return "deploy";
  return "other";
}

function describeScript(name: string, cmd: string): string {
  // Try to generate a human-friendly description from the command
  if (cmd.includes("next dev")) return "Start Next.js dev server";
  if (cmd.includes("next build")) return "Build Next.js for production";
  if (cmd.includes("vitest")) return "Run Vitest test suite";
  if (cmd.includes("jest")) return "Run Jest test suite";
  if (cmd.includes("eslint")) return "Run ESLint";
  if (cmd.includes("prettier")) return "Run Prettier formatter";
  if (cmd.includes("tsc")) return "TypeScript type checking";
  if (cmd.includes("prisma migrate")) return "Run Prisma migrations";
  return `Run ${name}`;
}
