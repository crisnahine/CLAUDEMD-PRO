// src/analyzers/stack-detector.ts
import { existsSync, readFileSync } from "fs";
import { join } from "path";
function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function readText(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
function fileExists(root, ...segments) {
  return existsSync(join(root, ...segments));
}
async function detectStack(rootDir, forceFramework) {
  const profile = {
    language: "unknown",
    framework: "unknown",
    languageVersion: null,
    frameworkVersion: null,
    runtime: null,
    packageManager: null,
    monorepo: false,
    keyDeps: {}
  };
  profile.monorepo = fileExists(rootDir, "pnpm-workspace.yaml") || fileExists(rootDir, "lerna.json") || fileExists(rootDir, "nx.json") || readJson(join(rootDir, "package.json"))?.workspaces != null;
  const gemfile = readText(join(rootDir, "Gemfile"));
  if (gemfile) {
    profile.language = "ruby";
    profile.packageManager = "bundler";
    const rubyVersionFile = readText(join(rootDir, ".ruby-version"));
    profile.languageVersion = rubyVersionFile?.trim() ?? null;
    const gemPattern = /gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/g;
    let match;
    while ((match = gemPattern.exec(gemfile)) !== null) {
      profile.keyDeps[match[1]] = match[2] ?? "*";
    }
    if (profile.keyDeps["rails"]) {
      profile.framework = "rails";
      profile.frameworkVersion = profile.keyDeps["rails"];
      profile.runtime = "ruby";
    }
  }
  const pkgJson = readJson(join(rootDir, "package.json"));
  if (pkgJson && profile.language === "unknown") {
    const allDeps = {
      ...pkgJson.dependencies ?? {},
      ...pkgJson.devDependencies ?? {}
    };
    profile.keyDeps = { ...profile.keyDeps, ...allDeps };
    profile.language = fileExists(rootDir, "tsconfig.json") || allDeps["typescript"] ? "typescript" : "javascript";
    if (fileExists(rootDir, "bun.lockb") || fileExists(rootDir, "bunfig.toml")) {
      profile.runtime = "bun";
    } else if (fileExists(rootDir, "deno.json") || fileExists(rootDir, "deno.lock")) {
      profile.runtime = "deno";
    } else {
      profile.runtime = "node";
    }
    if (fileExists(rootDir, "pnpm-lock.yaml")) {
      profile.packageManager = "pnpm";
    } else if (fileExists(rootDir, "yarn.lock")) {
      profile.packageManager = "yarn";
    } else if (fileExists(rootDir, "bun.lockb")) {
      profile.packageManager = "bun";
    } else {
      profile.packageManager = "npm";
    }
    const nvmrc = readText(join(rootDir, ".nvmrc"));
    const nodeVersion = readText(join(rootDir, ".node-version"));
    profile.languageVersion = nvmrc?.trim() ?? nodeVersion?.trim() ?? pkgJson.engines?.node ?? null;
    if (allDeps["next"]) {
      profile.framework = "nextjs";
      profile.frameworkVersion = allDeps["next"];
    } else if (allDeps["@remix-run/node"] || allDeps["@remix-run/react"]) {
      profile.framework = "remix";
      profile.frameworkVersion = allDeps["@remix-run/node"] ?? allDeps["@remix-run/react"];
    } else if (allDeps["fastify"]) {
      profile.framework = "fastify";
      profile.frameworkVersion = allDeps["fastify"];
    } else if (allDeps["express"]) {
      profile.framework = "express";
      profile.frameworkVersion = allDeps["express"];
    }
  }
  const requirements = readText(join(rootDir, "requirements.txt"));
  const pyproject = readText(join(rootDir, "pyproject.toml"));
  if ((requirements || pyproject) && profile.language === "unknown") {
    profile.language = "python";
    profile.runtime = "python";
    if (fileExists(rootDir, "poetry.lock")) {
      profile.packageManager = "poetry";
    } else if (fileExists(rootDir, "Pipfile")) {
      profile.packageManager = "pipenv";
    } else if (pyproject?.includes("[tool.uv]")) {
      profile.packageManager = "uv";
    } else {
      profile.packageManager = "pip";
    }
    const pyVersion = readText(join(rootDir, ".python-version"));
    profile.languageVersion = pyVersion?.trim() ?? null;
    if (requirements) {
      for (const line of requirements.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
        const depMatch = trimmed.match(/^([a-zA-Z0-9_-]+)(?:[=<>!~].*)?$/);
        if (depMatch) {
          const version = trimmed.match(/[=<>!~]+(.+)/)?.[1] ?? "*";
          profile.keyDeps[depMatch[1].toLowerCase()] = version;
        }
      }
    }
    if (pyproject) {
      const depsSection = pyproject.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
      if (depsSection) {
        for (const line of depsSection[1].split("\n")) {
          const depMatch = line.match(/["']([a-zA-Z0-9_-]+)/);
          if (depMatch) profile.keyDeps[depMatch[1].toLowerCase()] = "*";
        }
      }
    }
    const depsText = requirements ?? pyproject ?? "";
    if (/django/i.test(depsText)) {
      profile.framework = "django";
    } else if (/flask/i.test(depsText)) {
      profile.framework = "flask";
    } else if (/fastapi/i.test(depsText)) {
      profile.framework = "fastapi";
    }
  }
  if (fileExists(rootDir, "go.mod") && profile.language === "unknown") {
    profile.language = "go";
    profile.runtime = "go";
    profile.packageManager = "go modules";
    const goMod = readText(join(rootDir, "go.mod"));
    const goVersion = goMod?.match(/^go\s+(\d+\.\d+)/m);
    profile.languageVersion = goVersion?.[1] ?? null;
    if (goMod) {
      const requireBlock = goMod.match(/require\s*\(([\s\S]*?)\)/);
      if (requireBlock) {
        for (const line of requireBlock[1].split("\n")) {
          const depMatch = line.trim().match(/^([\w./\-@]+)\s+([\w.\-]+)/);
          if (depMatch) profile.keyDeps[depMatch[1]] = depMatch[2];
        }
      }
      const singleReqs = goMod.matchAll(/require\s+([\w./\-@]+)\s+([\w.\-]+)/g);
      for (const m of singleReqs) profile.keyDeps[m[1]] = m[2];
    }
    if (goMod?.includes("github.com/gin-gonic/gin")) {
      profile.framework = "gin";
    } else if (goMod?.includes("github.com/labstack/echo")) {
      profile.framework = "echo";
    } else if (goMod?.includes("github.com/gofiber/fiber")) {
      profile.framework = "fiber";
    }
  }
  if (fileExists(rootDir, "Cargo.toml") && profile.language === "unknown") {
    profile.language = "rust";
    profile.runtime = "rust";
    profile.packageManager = "cargo";
    const cargoToml = readText(join(rootDir, "Cargo.toml"));
    if (cargoToml) {
      const rustVersion = cargoToml.match(/rust-version\s*=\s*"(\d+\.\d+)"/);
      profile.languageVersion = rustVersion?.[1] ?? null;
      const depsSection = cargoToml.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
      if (depsSection) {
        for (const line of depsSection[1].split("\n")) {
          const depMatch = line.match(/^(\w[\w-]*)\s*=/);
          if (depMatch) profile.keyDeps[depMatch[1]] = "*";
        }
      }
      if (cargoToml.includes("actix-web")) {
        profile.framework = "actix";
      } else if (cargoToml.includes("axum")) {
        profile.framework = "axum";
      } else if (cargoToml.includes("rocket")) {
        profile.framework = "rocket";
      }
    }
  }
  if ((fileExists(rootDir, "pom.xml") || fileExists(rootDir, "build.gradle") || fileExists(rootDir, "build.gradle.kts")) && profile.language === "unknown") {
    profile.language = "java";
    profile.runtime = "java";
    profile.packageManager = fileExists(rootDir, "pom.xml") ? "maven" : "gradle";
    const pomXml = readText(join(rootDir, "pom.xml"));
    const buildGradle = readText(join(rootDir, "build.gradle")) ?? readText(join(rootDir, "build.gradle.kts"));
    const javaVersion = readText(join(rootDir, ".java-version"));
    profile.languageVersion = javaVersion?.trim() ?? null;
    if (pomXml?.includes("spring-boot") || buildGradle?.includes("spring-boot")) {
      profile.framework = "spring";
    }
  }
  if (fileExists(rootDir, "composer.json") && profile.language === "unknown") {
    profile.language = "php";
    profile.runtime = "php";
    profile.packageManager = "composer";
    const composer = readJson(join(rootDir, "composer.json"));
    if (composer?.require?.["laravel/framework"]) {
      profile.framework = "laravel";
      profile.frameworkVersion = composer.require["laravel/framework"];
    }
  }
  if (fileExists(rootDir, "mix.exs") && profile.language === "unknown") {
    profile.language = "elixir";
    profile.runtime = "elixir";
    profile.packageManager = "hex";
    const mixExs = readText(join(rootDir, "mix.exs"));
    if (mixExs?.includes(":phoenix")) {
      profile.framework = "phoenix";
    }
  }
  if (forceFramework) {
    profile.framework = forceFramework;
  }
  return profile;
}

// src/analyzers/architecture.ts
import { readdirSync, statSync } from "fs";
import { join as join2 } from "path";
var DIR_PURPOSES = {
  rails: {
    "app/models": "ActiveRecord models",
    "app/controllers": "Request handlers",
    "app/views": "ERB/HTML templates",
    "app/services": "Service objects (business logic)",
    "app/jobs": "Background jobs (Sidekiq/ActiveJob)",
    "app/mailers": "Email senders",
    "app/policies": "Pundit authorization policies",
    "app/serializers": "JSON serializers",
    "app/forms": "Form objects",
    "app/javascript": "Frontend JS (Stimulus/etc.)",
    "app/components": "ViewComponent components",
    "app/helpers": "View helpers",
    "config": "App configuration",
    "db/migrate": "Database migrations",
    "lib": "Library code / extensions",
    "spec": "RSpec test suite",
    "test": "Minitest test suite"
  },
  nextjs: {
    "src/app": "App Router pages and layouts",
    "src/pages": "Pages Router (legacy)",
    "src/components": "React components",
    "src/lib": "Shared utilities",
    "src/hooks": "Custom React hooks",
    "src/styles": "CSS/Tailwind styles",
    "src/types": "TypeScript type definitions",
    "public": "Static assets",
    "prisma": "Prisma ORM schema and migrations"
  },
  django: {
    "config": "Django project settings",
    "templates": "HTML templates (Jinja2/DTL)",
    "static": "Static assets (CSS/JS/images)",
    "media": "User-uploaded media",
    "locale": "Internationalization files",
    "fixtures": "Database fixtures",
    "management": "Custom management commands"
  },
  fastapi: {
    "app": "Application modules",
    "app/api": "API route handlers",
    "app/models": "SQLAlchemy/Pydantic models",
    "app/schemas": "Pydantic request/response schemas",
    "app/crud": "CRUD operations",
    "app/core": "Core configuration",
    "alembic": "Database migrations",
    "tests": "Pytest test suite"
  },
  flask: {
    "app": "Application package",
    "app/templates": "Jinja2 templates",
    "app/static": "Static files",
    "app/models": "SQLAlchemy models",
    "migrations": "Alembic/Flask-Migrate migrations",
    "tests": "Pytest test suite"
  },
  laravel: {
    "app/Models": "Eloquent models",
    "app/Http/Controllers": "Request controllers",
    "app/Http/Middleware": "HTTP middleware",
    "app/Http/Requests": "Form request validation",
    "app/Services": "Service classes",
    "app/Jobs": "Queued jobs",
    "app/Events": "Event classes",
    "app/Listeners": "Event listeners",
    "app/Policies": "Authorization policies",
    "app/Providers": "Service providers",
    "database/migrations": "Database migrations",
    "database/seeders": "Database seeders",
    "database/factories": "Model factories",
    "resources/views": "Blade templates",
    "routes": "Route definitions",
    "config": "Configuration files",
    "tests": "PHPUnit test suite"
  },
  spring: {
    "src/main/java": "Java source code",
    "src/main/resources": "Configuration & templates",
    "src/test/java": "Test source code",
    "src/test/resources": "Test configuration"
  },
  phoenix: {
    "lib": "Application source code",
    "lib/web": "Web layer (controllers, views, channels)",
    "lib/web/live": "LiveView modules",
    "lib/web/controllers": "Phoenix controllers",
    "lib/web/templates": "EEx templates",
    "priv/repo/migrations": "Ecto migrations",
    "priv/static": "Static assets",
    "test": "ExUnit test suite",
    "config": "Application configuration"
  },
  gin: {
    "cmd": "Application entry points",
    "internal": "Private application code",
    "pkg": "Public library code",
    "api": "API definitions / handlers",
    "handlers": "HTTP handlers",
    "models": "Data models",
    "middleware": "HTTP middleware",
    "config": "Configuration",
    "migrations": "Database migrations"
  },
  echo: {
    "cmd": "Application entry points",
    "internal": "Private application code",
    "pkg": "Public library code",
    "handlers": "HTTP handlers",
    "middleware": "HTTP middleware"
  },
  fiber: {
    "cmd": "Application entry points",
    "internal": "Private application code",
    "handlers": "HTTP handlers",
    "middleware": "HTTP middleware"
  },
  actix: {
    "src": "Rust source code",
    "src/handlers": "HTTP handlers",
    "src/models": "Data models",
    "src/middleware": "Middleware",
    "migrations": "Database migrations",
    "tests": "Integration tests"
  },
  axum: {
    "src": "Rust source code",
    "src/handlers": "Route handlers",
    "src/models": "Data models",
    "src/layers": "Tower middleware layers",
    "migrations": "Database migrations"
  },
  generic: {
    src: "Source code",
    lib: "Library code",
    test: "Tests",
    tests: "Tests",
    docs: "Documentation",
    scripts: "Build/utility scripts",
    config: "Configuration",
    public: "Public/static assets",
    dist: "Build output",
    build: "Build output"
  }
};
var IGNORE_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".next",
  "__pycache__",
  ".bundle",
  "vendor",
  "tmp",
  "log",
  "coverage",
  "dist",
  "build",
  ".cache",
  ".turbo"
]);
async function analyzeArchitecture(rootDir, stack) {
  const purposes = DIR_PURPOSES[stack.framework] ?? DIR_PURPOSES.generic;
  const topLevelDirs = [];
  let totalFiles = 0;
  const entries = readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) {
      if (entry.isFile()) totalFiles++;
      continue;
    }
    const dirPath = join2(rootDir, entry.name);
    const relPath = entry.name;
    const fileCount = countFiles(dirPath, 3);
    totalFiles += fileCount;
    const purpose = purposes[relPath] ?? DIR_PURPOSES.generic[relPath] ?? inferPurpose(relPath);
    topLevelDirs.push({ path: relPath, purpose, fileCount });
    if (stack.framework === "rails" && relPath === "app") {
      const appEntries = readdirSync(dirPath, { withFileTypes: true });
      for (const sub of appEntries) {
        if (!sub.isDirectory()) continue;
        const subPath = `app/${sub.name}`;
        const subCount = countFiles(join2(dirPath, sub.name), 2);
        const subPurpose = purposes[subPath] ?? inferPurpose(sub.name);
        topLevelDirs.push({ path: subPath, purpose: subPurpose, fileCount: subCount });
      }
    }
  }
  const patterns = detectPatterns(rootDir, stack, topLevelDirs);
  const entryPoints = detectEntryPoints(rootDir, stack);
  const estimatedSize = totalFiles < 50 ? "small" : totalFiles < 500 ? "medium" : "large";
  return {
    topLevelDirs: topLevelDirs.sort((a, b) => b.fileCount - a.fileCount),
    entryPoints,
    patterns,
    estimatedSize,
    totalFiles
  };
}
function countFiles(dir, maxDepth, depth = 0) {
  if (depth >= maxDepth) return 0;
  let count = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.isFile()) count++;
      else if (entry.isDirectory()) {
        count += countFiles(join2(dir, entry.name), maxDepth, depth + 1);
      }
    }
  } catch {
  }
  return count;
}
function inferPurpose(dirName) {
  const lower = dirName.toLowerCase();
  if (lower.includes("api")) return "API endpoints";
  if (lower.includes("util")) return "Utility functions";
  if (lower.includes("helper")) return "Helper functions";
  if (lower.includes("middleware")) return "Middleware";
  if (lower.includes("migration")) return "Database migrations";
  if (lower.includes("seed")) return "Database seeds";
  if (lower.includes("fixture")) return "Test fixtures";
  if (lower.includes("factory")) return "Test factories";
  if (lower.includes("type")) return "Type definitions";
  if (lower.includes("hook")) return "Custom hooks";
  if (lower.includes("store")) return "State management";
  return "Project directory";
}
function detectPatterns(rootDir, stack, dirs) {
  const patterns = [];
  const dirPaths = new Set(dirs.map((d) => d.path));
  if (stack.framework === "rails") {
    if (dirPaths.has("app/services")) patterns.push("Service objects pattern");
    if (dirPaths.has("app/forms")) patterns.push("Form objects pattern");
    if (dirPaths.has("app/policies")) patterns.push("Policy objects (Pundit)");
    if (dirPaths.has("app/serializers")) patterns.push("Serializer pattern");
    if (dirPaths.has("app/components")) patterns.push("ViewComponent");
    if (stack.keyDeps["turbo-rails"]) patterns.push("Hotwire (Turbo + Stimulus)");
    if (stack.keyDeps["stimulus-rails"]) patterns.push("Stimulus controllers");
    if (stack.keyDeps["importmap-rails"]) patterns.push("Import maps (no bundler)");
  }
  if (stack.language === "typescript" || stack.language === "javascript") {
    if (stack.keyDeps["zustand"]) patterns.push("Zustand state management");
    if (stack.keyDeps["@reduxjs/toolkit"]) patterns.push("Redux Toolkit");
    if (stack.keyDeps["@tanstack/react-query"]) patterns.push("TanStack Query");
    if (stack.keyDeps["drizzle-orm"]) patterns.push("Drizzle ORM");
    if (stack.keyDeps["@prisma/client"]) patterns.push("Prisma ORM");
    if (stack.keyDeps["trpc"] || stack.keyDeps["@trpc/server"]) patterns.push("tRPC");
  }
  if (stack.framework === "django") {
    if (stack.keyDeps["djangorestframework"]) patterns.push("Django REST Framework");
    if (stack.keyDeps["django-ninja"]) patterns.push("Django Ninja API");
    if (stack.keyDeps["celery"]) patterns.push("Celery task queue");
    if (stack.keyDeps["django-allauth"]) patterns.push("django-allauth (auth)");
    if (stack.keyDeps["channels"]) patterns.push("Django Channels (WebSockets)");
  }
  if (stack.framework === "fastapi") {
    patterns.push("Async request handling");
    if (stack.keyDeps["sqlalchemy"]) patterns.push("SQLAlchemy ORM");
    if (stack.keyDeps["celery"]) patterns.push("Celery background tasks");
  }
  if (stack.framework === "laravel") {
    if (dirPaths.has("app/Services")) patterns.push("Service classes");
    if (dirPaths.has("app/Actions")) patterns.push("Action classes");
    if (dirPaths.has("app/Jobs")) patterns.push("Queued jobs");
    if (stack.keyDeps["livewire/livewire"]) patterns.push("Livewire (reactive UI)");
    if (stack.keyDeps["inertiajs/inertia-laravel"]) patterns.push("Inertia.js (SPA)");
  }
  if (stack.framework === "phoenix") {
    if (stack.keyDeps["phoenix_live_view"]) patterns.push("Phoenix LiveView");
    if (stack.keyDeps["oban"]) patterns.push("Oban job processing");
    if (stack.keyDeps["absinthe"]) patterns.push("Absinthe GraphQL");
    patterns.push("Ecto contexts pattern");
  }
  if (stack.language === "go") {
    if (dirPaths.has("cmd")) patterns.push("cmd/ entry point pattern");
    if (dirPaths.has("internal")) patterns.push("internal/ package encapsulation");
    if (dirPaths.has("pkg")) patterns.push("pkg/ public library pattern");
    if (stack.keyDeps["github.com/google/wire"]) patterns.push("Wire dependency injection");
  }
  if (stack.language === "rust") {
    if (stack.keyDeps["tokio"]) patterns.push("Tokio async runtime");
    if (stack.keyDeps["tower"]) patterns.push("Tower middleware");
    if (stack.keyDeps["tracing"]) patterns.push("Structured tracing");
  }
  if (stack.framework === "spring") {
    patterns.push("Controller \u2192 Service \u2192 Repository layers");
    if (stack.keyDeps["spring-security"]) patterns.push("Spring Security");
    if (stack.keyDeps["flyway"]) patterns.push("Flyway migrations");
    if (stack.keyDeps["liquibase"]) patterns.push("Liquibase migrations");
  }
  if (dirPaths.has("docker") || dirPaths.has("docker-compose.yml")) {
    patterns.push("Docker containerization");
  }
  return patterns;
}
function detectEntryPoints(rootDir, stack) {
  const entries = [];
  const candidates = {
    rails: ["config/application.rb", "config/routes.rb", "config/puma.rb"],
    nextjs: ["src/app/layout.tsx", "src/app/page.tsx", "next.config.js", "next.config.ts"],
    express: ["src/index.ts", "src/app.ts", "src/server.ts", "index.js", "app.js"],
    fastify: ["src/index.ts", "src/app.ts", "src/server.ts"],
    django: ["manage.py", "config/urls.py", "config/settings.py"],
    fastapi: ["app/main.py", "main.py", "src/main.py"],
    flask: ["app.py", "wsgi.py", "app/__init__.py"],
    laravel: ["artisan", "routes/web.php", "routes/api.php", "config/app.php"],
    phoenix: ["lib/web/endpoint.ex", "lib/web/router.ex", "config/config.exs"],
    gin: ["cmd/server/main.go", "cmd/api/main.go", "main.go"],
    echo: ["cmd/server/main.go", "main.go"],
    fiber: ["cmd/server/main.go", "main.go"],
    spring: ["src/main/java/com/**/*Application.java", "src/main/resources/application.properties"],
    actix: ["src/main.rs", "src/lib.rs"],
    axum: ["src/main.rs", "src/lib.rs"],
    rocket: ["src/main.rs"],
    generic: ["src/index.ts", "src/main.ts", "index.ts", "main.ts", "src/index.js"]
  };
  const frameworkCandidates = candidates[stack.framework] ?? candidates.generic;
  for (const candidate of frameworkCandidates) {
    if (statSync(join2(rootDir, candidate), { throwIfNoEntry: false })?.isFile()) {
      entries.push(candidate);
    }
  }
  return entries;
}

// src/analyzers/commands.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "fs";
import { join as join3 } from "path";
async function analyzeCommands(rootDir, stack) {
  const commands = [];
  let devServer = null;
  let hasLinter = false;
  let hasFormatter = false;
  let hasTypecheck = false;
  if (existsSync2(join3(rootDir, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync2(join3(rootDir, "package.json"), "utf-8"));
      const scripts = pkg.scripts ?? {};
      for (const [name, cmd] of Object.entries(scripts)) {
        const command = `${stack.packageManager ?? "npm"} run ${name}`;
        const category = categorizeScript(name, cmd);
        if (category === "dev" && !devServer) devServer = command;
        if (name.includes("lint")) hasLinter = true;
        if (name.includes("format") || name.includes("prettier")) hasFormatter = true;
        if (name.includes("typecheck") || name.includes("tsc")) hasTypecheck = true;
        commands.push({
          command,
          description: describeScript(name, cmd),
          category
        });
      }
    } catch {
    }
  }
  if (stack.framework === "rails") {
    if (existsSync2(join3(rootDir, "bin/dev"))) {
      devServer = "bin/dev";
      commands.push({
        command: "bin/dev",
        description: "Start dev server (Procfile.dev)",
        category: "dev"
      });
    }
    commands.push(
      { command: "bin/rails test", description: "Run test suite", category: "test" },
      { command: "bin/rails db:migrate", description: "Run pending migrations", category: "db" },
      {
        command: "bin/rails db:migrate:status",
        description: "Check migration status",
        category: "db"
      }
    );
    if (existsSync2(join3(rootDir, "spec")) || stack.keyDeps["rspec-rails"]) {
      commands.push({
        command: "bundle exec rspec",
        description: "Run RSpec test suite",
        category: "test"
      });
    }
    if (stack.keyDeps["rubocop"] || existsSync2(join3(rootDir, ".rubocop.yml"))) {
      hasLinter = true;
      commands.push({
        command: "bundle exec rubocop -a",
        description: "Lint & auto-fix Ruby code",
        category: "lint"
      });
    }
    if (existsSync2(join3(rootDir, "test/system")) || existsSync2(join3(rootDir, "spec/system"))) {
      commands.push({
        command: "bin/rails test:system",
        description: "Run system/integration tests",
        category: "test"
      });
    }
  }
  if (stack.framework === "django") {
    if (existsSync2(join3(rootDir, "manage.py"))) {
      devServer = devServer ?? "python manage.py runserver";
      commands.push(
        { command: "python manage.py runserver", description: "Start Django dev server", category: "dev" },
        { command: "python manage.py test", description: "Run Django test suite", category: "test" },
        { command: "python manage.py migrate", description: "Run pending migrations", category: "db" },
        { command: "python manage.py makemigrations", description: "Create new migrations", category: "db" },
        { command: "python manage.py shell", description: "Django interactive shell", category: "other" }
      );
    }
    if (stack.keyDeps["ruff"] || existsSync2(join3(rootDir, "ruff.toml"))) {
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
  if (stack.framework === "fastapi") {
    devServer = devServer ?? "uvicorn app.main:app --reload";
    commands.push(
      { command: "uvicorn app.main:app --reload", description: "Start FastAPI dev server", category: "dev" }
    );
    if (existsSync2(join3(rootDir, "alembic.ini"))) {
      commands.push(
        { command: "alembic upgrade head", description: "Run Alembic migrations", category: "db" },
        { command: "alembic revision --autogenerate -m ''", description: "Create new migration", category: "db" }
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
  if (stack.framework === "flask") {
    devServer = devServer ?? "flask run --debug";
    commands.push(
      { command: "flask run --debug", description: "Start Flask dev server", category: "dev" }
    );
    if (existsSync2(join3(rootDir, "migrations"))) {
      commands.push({ command: "flask db upgrade", description: "Run Flask-Migrate migrations", category: "db" });
    }
  }
  if (stack.framework === "laravel") {
    devServer = devServer ?? "php artisan serve";
    commands.push(
      { command: "php artisan serve", description: "Start Laravel dev server", category: "dev" },
      { command: "php artisan test", description: "Run PHPUnit test suite", category: "test" },
      { command: "php artisan migrate", description: "Run pending migrations", category: "db" },
      { command: "php artisan migrate:status", description: "Check migration status", category: "db" },
      { command: "php artisan tinker", description: "Interactive REPL", category: "other" }
    );
    if (stack.keyDeps["laravel/pint"] || existsSync2(join3(rootDir, "pint.json"))) {
      hasLinter = true;
      hasFormatter = true;
      commands.push({ command: "./vendor/bin/pint", description: "Run Laravel Pint (code style)", category: "lint" });
    }
    if (stack.keyDeps["phpstan/phpstan"] || existsSync2(join3(rootDir, "phpstan.neon"))) {
      hasTypecheck = true;
      commands.push({ command: "./vendor/bin/phpstan analyse", description: "Run PHPStan static analysis", category: "lint" });
    }
  }
  if (stack.framework === "phoenix") {
    devServer = devServer ?? "mix phx.server";
    commands.push(
      { command: "mix phx.server", description: "Start Phoenix dev server", category: "dev" },
      { command: "mix test", description: "Run ExUnit test suite", category: "test" },
      { command: "mix ecto.migrate", description: "Run Ecto migrations", category: "db" },
      { command: "mix ecto.gen.migration", description: "Generate new migration", category: "db" }
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
  if (stack.language === "go") {
    devServer = devServer ?? "go run .";
    commands.push(
      { command: "go run .", description: "Run the application", category: "dev" },
      { command: "go test ./...", description: "Run all Go tests", category: "test" },
      { command: "go build -o bin/app .", description: "Build binary", category: "build" }
    );
    if (stack.keyDeps["github.com/cosmtrek/air"] || existsSync2(join3(rootDir, ".air.toml"))) {
      devServer = "air";
      commands.push({ command: "air", description: "Hot-reload dev server", category: "dev" });
    }
    if (existsSync2(join3(rootDir, ".golangci.yml")) || existsSync2(join3(rootDir, ".golangci.yaml"))) {
      hasLinter = true;
      commands.push({ command: "golangci-lint run", description: "Run Go linters", category: "lint" });
    }
  }
  if (stack.language === "rust") {
    devServer = devServer ?? "cargo run";
    commands.push(
      { command: "cargo run", description: "Build and run", category: "dev" },
      { command: "cargo test", description: "Run test suite", category: "test" },
      { command: "cargo build --release", description: "Release build", category: "build" },
      { command: "cargo clippy", description: "Run Clippy linter", category: "lint" },
      { command: "cargo fmt --check", description: "Check formatting", category: "lint" }
    );
    hasLinter = true;
    hasFormatter = true;
    if (existsSync2(join3(rootDir, "diesel.toml"))) {
      commands.push({ command: "diesel migration run", description: "Run Diesel migrations", category: "db" });
    }
  }
  if (stack.framework === "spring") {
    const isGradle = existsSync2(join3(rootDir, "gradlew"));
    const runner = isGradle ? "./gradlew" : "mvn";
    devServer = devServer ?? `${runner} ${isGradle ? "bootRun" : "spring-boot:run"}`;
    commands.push(
      { command: `${runner} ${isGradle ? "bootRun" : "spring-boot:run"}`, description: "Start Spring Boot dev server", category: "dev" },
      { command: `${runner} test`, description: "Run test suite", category: "test" },
      { command: `${runner} ${isGradle ? "build" : "package"}`, description: "Build application", category: "build" }
    );
  }
  if (existsSync2(join3(rootDir, "Makefile"))) {
    const makefile = readFileSync2(join3(rootDir, "Makefile"), "utf-8");
    const targets = makefile.match(/^([a-zA-Z_-]+):/gm);
    if (targets) {
      for (const target of targets.slice(0, 10)) {
        const name = target.replace(":", "");
        commands.push({
          command: `make ${name}`,
          description: `Makefile target: ${name}`,
          category: categorizeScript(name, "")
        });
      }
    }
  }
  return { commands, devServer, hasLinter, hasFormatter, hasTypecheck };
}
function categorizeScript(name, cmd) {
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
function describeScript(name, cmd) {
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

// src/analyzers/database.ts
import { existsSync as existsSync3, readFileSync as readFileSync3, readdirSync as readdirSync2 } from "fs";
import { join as join4 } from "path";
async function analyzeDatabase(rootDir, stack) {
  const profile = {
    adapter: null,
    orm: null,
    tableCount: 0,
    hasMigrations: false,
    migrationDir: null,
    keyModels: []
  };
  if (stack.framework === "rails") {
    profile.orm = "ActiveRecord";
    const dbYml = readSafe(join4(rootDir, "config/database.yml"));
    if (dbYml) {
      if (dbYml.includes("postgresql")) profile.adapter = "postgresql";
      else if (dbYml.includes("mysql")) profile.adapter = "mysql";
      else if (dbYml.includes("sqlite")) profile.adapter = "sqlite3";
    }
    const schema = readSafe(join4(rootDir, "db/schema.rb"));
    if (schema) {
      const tables = schema.match(/create_table/g);
      profile.tableCount = tables?.length ?? 0;
    }
    if (existsSync3(join4(rootDir, "db/migrate"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "db/migrate";
    }
    const modelsDir = join4(rootDir, "app/models");
    if (existsSync3(modelsDir)) {
      profile.keyModels = readdirSync2(modelsDir).filter((f) => f.endsWith(".rb") && f !== "application_record.rb").map((f) => f.replace(".rb", "")).slice(0, 20);
    }
  }
  if (stack.keyDeps["@prisma/client"] || existsSync3(join4(rootDir, "prisma/schema.prisma"))) {
    profile.orm = "Prisma";
    const prismaSchema = readSafe(join4(rootDir, "prisma/schema.prisma"));
    if (prismaSchema) {
      if (prismaSchema.includes("postgresql")) profile.adapter = "postgresql";
      else if (prismaSchema.includes("mysql")) profile.adapter = "mysql";
      else if (prismaSchema.includes("sqlite")) profile.adapter = "sqlite3";
      const models = prismaSchema.match(/^model\s+(\w+)/gm);
      profile.tableCount = models?.length ?? 0;
      profile.keyModels = models?.map((m) => m.replace("model ", "")).slice(0, 20) ?? [];
    }
    profile.hasMigrations = existsSync3(join4(rootDir, "prisma/migrations"));
    profile.migrationDir = "prisma/migrations";
  }
  if (stack.keyDeps["drizzle-orm"]) {
    profile.orm = "Drizzle";
  }
  if (stack.framework === "django") {
    profile.orm = "Django ORM";
    const settingsFiles = ["config/settings.py", "settings.py", "config/settings/base.py"];
    for (const sf of settingsFiles) {
      const settings = readSafe(join4(rootDir, sf));
      if (settings) {
        if (settings.includes("postgresql") || settings.includes("psycopg")) profile.adapter = "postgresql";
        else if (settings.includes("mysql")) profile.adapter = "mysql";
        else if (settings.includes("sqlite")) profile.adapter = "sqlite3";
        break;
      }
    }
    const appDirs = readdirSync2(rootDir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync3(join4(rootDir, d.name, "models.py")));
    for (const dir of appDirs) {
      const models = readSafe(join4(rootDir, dir.name, "models.py"));
      if (models) {
        const modelClasses = models.match(/class\s+\w+\(.*Model\)/g);
        profile.tableCount += modelClasses?.length ?? 0;
        profile.keyModels.push(
          ...modelClasses?.map((m) => m.match(/class\s+(\w+)/)?.[1] ?? "").filter(Boolean).slice(0, 10) ?? []
        );
      }
    }
    if (existsSync3(join4(rootDir, "migrations")) || appDirs.some((d) => existsSync3(join4(rootDir, d.name, "migrations")))) {
      profile.hasMigrations = true;
      profile.migrationDir = "*/migrations";
    }
  }
  if ((stack.framework === "fastapi" || stack.framework === "flask") && stack.keyDeps["sqlalchemy"]) {
    profile.orm = "SQLAlchemy";
    if (existsSync3(join4(rootDir, "alembic.ini"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "alembic/versions";
    }
    if (existsSync3(join4(rootDir, "migrations"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "migrations";
    }
  }
  if (stack.framework === "laravel") {
    profile.orm = "Eloquent";
    const envFile = readSafe(join4(rootDir, ".env"));
    if (envFile) {
      if (envFile.includes("DB_CONNECTION=pgsql")) profile.adapter = "postgresql";
      else if (envFile.includes("DB_CONNECTION=mysql")) profile.adapter = "mysql";
      else if (envFile.includes("DB_CONNECTION=sqlite")) profile.adapter = "sqlite3";
    }
    if (existsSync3(join4(rootDir, "database/migrations"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "database/migrations";
      const migrations = readdirSync2(join4(rootDir, "database/migrations")).filter((f) => f.endsWith(".php"));
      profile.tableCount = migrations.filter((f) => f.includes("create_")).length;
    }
    if (existsSync3(join4(rootDir, "app/Models"))) {
      profile.keyModels = readdirSync2(join4(rootDir, "app/Models")).filter((f) => f.endsWith(".php") && f !== "Model.php").map((f) => f.replace(".php", "")).slice(0, 20);
    }
  }
  if (stack.framework === "phoenix") {
    profile.orm = "Ecto";
    if (existsSync3(join4(rootDir, "priv/repo/migrations"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "priv/repo/migrations";
    }
  }
  if (stack.language === "go" && (stack.keyDeps["gorm.io/gorm"] || stack.keyDeps["github.com/go-gorm/gorm"])) {
    profile.orm = "GORM";
  }
  if (stack.language === "rust" && stack.keyDeps["diesel"]) {
    profile.orm = "Diesel";
    if (existsSync3(join4(rootDir, "migrations"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "migrations";
    }
  }
  if (stack.language === "rust" && stack.keyDeps["sqlx"]) {
    profile.orm = profile.orm ?? "SQLx";
    if (existsSync3(join4(rootDir, "migrations"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "migrations";
    }
  }
  if (stack.framework === "spring") {
    profile.orm = "JPA/Hibernate";
    const appProps = readSafe(join4(rootDir, "src/main/resources/application.properties")) ?? readSafe(join4(rootDir, "src/main/resources/application.yml"));
    if (appProps) {
      if (appProps.includes("postgresql")) profile.adapter = "postgresql";
      else if (appProps.includes("mysql")) profile.adapter = "mysql";
      else if (appProps.includes("h2")) profile.adapter = "h2";
    }
    if (existsSync3(join4(rootDir, "src/main/resources/db/migration"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "src/main/resources/db/migration";
    }
  }
  return profile;
}
function readSafe(path) {
  try {
    return existsSync3(path) ? readFileSync3(path, "utf-8") : null;
  } catch {
    return null;
  }
}

// src/analyzers/testing.ts
import { existsSync as existsSync4 } from "fs";
import { join as join5 } from "path";
async function analyzeTesting(rootDir, stack) {
  const profile = {
    framework: null,
    testDir: null,
    hasSystemTests: false,
    hasFactories: false,
    hasMocking: false,
    coverageTool: null
  };
  if (stack.framework === "rails") {
    if (stack.keyDeps["rspec-rails"] || existsSync4(join5(rootDir, "spec"))) {
      profile.framework = "rspec";
      profile.testDir = "spec";
    } else if (existsSync4(join5(rootDir, "test"))) {
      profile.framework = "minitest";
      profile.testDir = "test";
    }
    profile.hasFactories = !!stack.keyDeps["factory_bot_rails"];
    profile.hasMocking = !!stack.keyDeps["webmock"] || !!stack.keyDeps["vcr"];
    profile.hasSystemTests = existsSync4(join5(rootDir, "spec/system")) || existsSync4(join5(rootDir, "test/system"));
    if (stack.keyDeps["simplecov"]) profile.coverageTool = "simplecov";
  }
  if (stack.language === "typescript" || stack.language === "javascript") {
    if (stack.keyDeps["vitest"]) profile.framework = "vitest";
    else if (stack.keyDeps["jest"]) profile.framework = "jest";
    else if (stack.keyDeps["mocha"]) profile.framework = "mocha";
    if (existsSync4(join5(rootDir, "tests"))) profile.testDir = "tests";
    else if (existsSync4(join5(rootDir, "test"))) profile.testDir = "test";
    else if (existsSync4(join5(rootDir, "__tests__"))) profile.testDir = "__tests__";
    else if (existsSync4(join5(rootDir, "src/__tests__")))
      profile.testDir = "src/__tests__";
    if (stack.keyDeps["@playwright/test"]) profile.hasSystemTests = true;
    if (stack.keyDeps["cypress"]) profile.hasSystemTests = true;
    if (stack.keyDeps["msw"]) profile.hasMocking = true;
    if (stack.keyDeps["c8"] || stack.keyDeps["istanbul"]) profile.coverageTool = "c8";
  }
  if (stack.language === "python") {
    if (stack.keyDeps["pytest"]) profile.framework = "pytest";
    else profile.framework = "unittest";
    profile.testDir = existsSync4(join5(rootDir, "tests")) ? "tests" : "test";
    if (stack.keyDeps["factory_boy"] || stack.keyDeps["factory-boy"]) profile.hasFactories = true;
    if (stack.keyDeps["responses"] || stack.keyDeps["httpretty"] || stack.keyDeps["vcrpy"]) profile.hasMocking = true;
    if (stack.keyDeps["coverage"] || stack.keyDeps["pytest-cov"]) profile.coverageTool = "coverage.py";
    if (stack.keyDeps["selenium"] || stack.keyDeps["playwright"]) profile.hasSystemTests = true;
  }
  if (stack.language === "php") {
    profile.framework = "phpunit";
    profile.testDir = existsSync4(join5(rootDir, "tests")) ? "tests" : "test";
    if (stack.framework === "laravel") {
      profile.hasFactories = existsSync4(join5(rootDir, "database/factories"));
      if (stack.keyDeps["laravel/dusk"]) profile.hasSystemTests = true;
    }
  }
  if (stack.language === "elixir") {
    profile.framework = "exunit";
    profile.testDir = "test";
    if (stack.keyDeps["ex_machina"]) profile.hasFactories = true;
    if (stack.keyDeps["mox"]) profile.hasMocking = true;
    if (stack.keyDeps["wallaby"]) profile.hasSystemTests = true;
  }
  if (stack.language === "go") {
    profile.framework = "go test";
    profile.testDir = ".";
    if (stack.keyDeps["github.com/stretchr/testify"]) profile.hasMocking = true;
  }
  if (stack.language === "rust") {
    profile.framework = "cargo test";
    profile.testDir = "tests";
    if (stack.keyDeps["mockall"]) profile.hasMocking = true;
  }
  if (stack.language === "java") {
    profile.framework = "junit";
    profile.testDir = "src/test/java";
    if (stack.keyDeps["mockito"]) profile.hasMocking = true;
  }
  return profile;
}

// src/analyzers/gotchas.ts
import { existsSync as existsSync5, readFileSync as readFileSync4 } from "fs";
import { join as join6 } from "path";
async function analyzeGotchas(rootDir, stack) {
  const generatedDirs = [];
  const generatedFiles = [];
  const gotchas = [];
  const gitignore = readSafe2(join6(rootDir, ".gitignore"));
  if (gitignore) {
    const patterns = gitignore.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    const genPatterns = [
      /^(dist|build|out|\.next|\.nuxt)\/?$/,
      /generated/i,
      /^(coverage|\.coverage)\/?$/,
      /^(tmp|temp|log|logs)\/?$/,
      /assets\/builds/
    ];
    for (const pattern of patterns) {
      if (genPatterns.some((gp) => gp.test(pattern))) {
        if (pattern.endsWith("/")) generatedDirs.push(pattern);
        else generatedDirs.push(pattern);
      }
    }
  }
  if (stack.framework === "rails") {
    generatedFiles.push("db/schema.rb");
    gotchas.push(
      {
        rule: "DON'T modify db/schema.rb directly",
        reason: "Use migrations only \u2014 schema.rb is auto-generated",
        severity: "critical"
      },
      {
        rule: "DON'T skip Pundit authorization in controllers",
        reason: "Every controller action needs `authorize @resource`",
        severity: "critical"
      },
      {
        rule: "DON'T add N+1 queries",
        reason: "Use `.includes()` or `.preload()` for associations",
        severity: "important"
      },
      {
        rule: "DON'T put business logic in controllers",
        reason: "Extract to service objects in app/services/",
        severity: "important"
      },
      {
        rule: "DON'T commit credentials directly",
        reason: "Use `bin/rails credentials:edit` for secrets",
        severity: "critical"
      }
    );
    if (stack.keyDeps["cssbundling-rails"]) {
      generatedDirs.push("app/assets/builds/");
      gotchas.push({
        rule: "DON'T modify app/assets/builds/",
        reason: "Auto-generated by cssbundling-rails",
        severity: "important"
      });
    }
  }
  if (stack.framework === "nextjs") {
    generatedDirs.push(".next/");
    gotchas.push({
      rule: "DON'T modify .next/ directory",
      reason: "Auto-generated build cache",
      severity: "critical"
    });
  }
  if (stack.framework === "django") {
    gotchas.push(
      {
        rule: "DON'T modify migration files after they're applied",
        reason: "Create new migrations instead \u2014 editing applied migrations breaks the chain",
        severity: "critical"
      },
      {
        rule: "DON'T hardcode settings values",
        reason: "Use environment variables via django-environ or os.environ",
        severity: "important"
      },
      {
        rule: "DON'T use raw SQL without parameterization",
        reason: "Use Django ORM or parameterized queries to prevent SQL injection",
        severity: "critical"
      },
      {
        rule: "DON'T put business logic in views",
        reason: "Extract to services or model methods \u2014 views are for HTTP handling",
        severity: "important"
      }
    );
  }
  if (stack.framework === "fastapi") {
    gotchas.push(
      {
        rule: "DON'T block the event loop with sync operations",
        reason: "Use async/await for I/O \u2014 blocking calls freeze the entire server",
        severity: "critical"
      },
      {
        rule: "ALWAYS use Pydantic models for request/response validation",
        reason: "Type safety and auto-documentation via OpenAPI",
        severity: "important"
      },
      {
        rule: "DON'T create DB sessions outside of dependency injection",
        reason: "Use FastAPI's Depends() for proper session lifecycle",
        severity: "important"
      }
    );
  }
  if (stack.framework === "laravel") {
    gotchas.push(
      {
        rule: "DON'T modify migration files after they run",
        reason: "Create new migrations \u2014 editing old ones causes state mismatch",
        severity: "critical"
      },
      {
        rule: "DON'T put business logic in controllers",
        reason: "Use service classes or actions \u2014 controllers are thin",
        severity: "important"
      },
      {
        rule: "DON'T skip Form Request validation",
        reason: "Always validate via Form Request classes, not inline in controllers",
        severity: "important"
      },
      {
        rule: "DON'T use env() outside config files",
        reason: "Cache breaks env() calls \u2014 use config() with config files that read env()",
        severity: "critical"
      }
    );
    generatedDirs.push("storage/", "bootstrap/cache/");
  }
  if (stack.framework === "phoenix") {
    gotchas.push(
      {
        rule: "DON'T modify Ecto migrations after they're run",
        reason: "Roll back first or create new migrations",
        severity: "critical"
      },
      {
        rule: "ALWAYS use changesets for data validation",
        reason: "Ecto changesets are the canonical validation layer",
        severity: "important"
      },
      {
        rule: "DON'T leak PubSub topics between contexts",
        reason: "Keep context boundaries clean for maintainability",
        severity: "important"
      }
    );
  }
  if (stack.language === "go") {
    gotchas.push(
      {
        rule: "DON'T ignore errors \u2014 always check returned error values",
        reason: "Go uses explicit error handling; unchecked errors cause silent failures",
        severity: "critical"
      },
      {
        rule: "DON'T use global state for request-scoped data",
        reason: "Use context.Context for request-scoped values",
        severity: "important"
      }
    );
    if (existsSync5(join6(rootDir, "go.sum"))) {
      generatedFiles.push("go.sum");
      gotchas.push({
        rule: "DON'T manually edit go.sum",
        reason: "Auto-generated by go mod tidy \u2014 commit it but don't modify by hand",
        severity: "important"
      });
    }
  }
  if (stack.language === "rust") {
    gotchas.push(
      {
        rule: "DON'T use .unwrap() in production code",
        reason: "Use proper error handling with ? operator or match",
        severity: "critical"
      },
      {
        rule: "DON'T fight the borrow checker \u2014 restructure code instead",
        reason: "If you need multiple mutable references, consider Arc<Mutex<T>> or restructure",
        severity: "important"
      }
    );
    if (existsSync5(join6(rootDir, "Cargo.lock"))) {
      generatedFiles.push("Cargo.lock");
    }
  }
  if (stack.framework === "spring") {
    gotchas.push(
      {
        rule: "DON'T put business logic in controllers",
        reason: "Use @Service classes \u2014 controllers call services, services call repositories",
        severity: "important"
      },
      {
        rule: "DON'T skip @Transactional on service methods that write",
        reason: "Database operations need proper transaction boundaries",
        severity: "critical"
      },
      {
        rule: "DON'T hardcode config values",
        reason: "Use @Value or @ConfigurationProperties with application.properties",
        severity: "important"
      }
    );
  }
  if (stack.keyDeps["@prisma/client"]) {
    generatedDirs.push("node_modules/.prisma/");
    gotchas.push(
      {
        rule: "DON'T modify files in node_modules/.prisma/",
        reason: "Auto-generated by `prisma generate`",
        severity: "critical"
      },
      {
        rule: "ALWAYS run `npx prisma generate` after schema changes",
        reason: "Client needs regeneration to reflect schema updates",
        severity: "important"
      }
    );
  }
  if (existsSync5(join6(rootDir, ".env.example")) || existsSync5(join6(rootDir, ".env"))) {
    gotchas.push({
      rule: "DON'T commit .env files",
      reason: "Use .env.example for template, actual env vars should be secrets",
      severity: "critical"
    });
  }
  return { generatedDirs, generatedFiles, gotchas };
}
function readSafe2(path) {
  try {
    return existsSync5(path) ? readFileSync4(path, "utf-8") : null;
  } catch {
    return null;
  }
}

// src/analyzers/env.ts
import { existsSync as existsSync6, readFileSync as readFileSync5 } from "fs";
import { join as join7 } from "path";
async function analyzeEnvironment(rootDir) {
  const envVars = [];
  const envExample = readSafe3(join7(rootDir, ".env.example"));
  if (envExample) {
    for (const line of envExample.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key) {
        envVars.push({
          name: key.trim(),
          hasDefault: rest.join("=").trim().length > 0,
          source: ".env.example"
        });
      }
    }
  }
  return {
    envVars,
    hasDocker: existsSync6(join7(rootDir, "Dockerfile")) || existsSync6(join7(rootDir, "docker/Dockerfile")),
    hasDockerCompose: existsSync6(join7(rootDir, "docker-compose.yml")) || existsSync6(join7(rootDir, "docker-compose.yaml")) || existsSync6(join7(rootDir, "compose.yml"))
  };
}
function readSafe3(path) {
  try {
    return existsSync6(path) ? readFileSync5(path, "utf-8") : null;
  } catch {
    return null;
  }
}

// src/analyzers/ci-cd.ts
import { existsSync as existsSync7, readdirSync as readdirSync3 } from "fs";
import { join as join8 } from "path";
async function analyzeCiCd(rootDir) {
  const profile = {
    provider: null,
    workflowFiles: [],
    hasDeployStep: false
  };
  const ghDir = join8(rootDir, ".github/workflows");
  if (existsSync7(ghDir)) {
    profile.provider = "github-actions";
    try {
      profile.workflowFiles = readdirSync3(ghDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).map((f) => `.github/workflows/${f}`);
      profile.hasDeployStep = profile.workflowFiles.some(
        (f) => f.toLowerCase().includes("deploy")
      );
    } catch {
    }
  }
  if (existsSync7(join8(rootDir, ".gitlab-ci.yml"))) {
    profile.provider = "gitlab-ci";
    profile.workflowFiles = [".gitlab-ci.yml"];
  }
  if (existsSync7(join8(rootDir, ".circleci/config.yml"))) {
    profile.provider = "circleci";
    profile.workflowFiles = [".circleci/config.yml"];
  }
  return profile;
}

// src/analyzers/git-history.ts
import { execSync } from "child_process";
import { existsSync as existsSync8 } from "fs";
import { join as join9 } from "path";
function runGit(rootDir, args) {
  try {
    return execSync(`git ${args}`, {
      cwd: rootDir,
      encoding: "utf-8",
      timeout: 1e4,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return null;
  }
}
async function analyzeGitHistory(rootDir) {
  const profile = {
    isGitRepo: existsSync8(join9(rootDir, ".git")),
    insights: [],
    topChangedFiles: [],
    recentContributors: 0
  };
  if (!profile.isGitRepo) return profile;
  const logOutput = runGit(rootDir, 'log --since="6 months ago" --name-only --pretty=format: --diff-filter=M');
  if (logOutput) {
    const fileCounts = /* @__PURE__ */ new Map();
    for (const line of logOutput.split("\n")) {
      const file = line.trim();
      if (!file || file.includes("node_modules") || file.includes(".lock")) continue;
      fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
    }
    profile.topChangedFiles = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([file, changes]) => ({ file, changes }));
    const dirCounts = /* @__PURE__ */ new Map();
    for (const [file, count] of fileCounts) {
      const dir = file.split("/").slice(0, 2).join("/");
      if (dir) dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + count);
    }
    const sortedDirs = [...dirCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topDir = sortedDirs[0];
    if (topDir && topDir[1] > 50) {
      profile.insights.push({
        type: "high-churn",
        message: `${topDir[0]}/ has ${topDir[1]} changes in 6 months \u2014 extra care needed here`,
        files: [topDir[0]],
        severity: "important"
      });
    }
  }
  const revertLog = runGit(rootDir, 'log --since="6 months ago" --grep="revert" --name-only --pretty=format: -i');
  if (revertLog) {
    const revertFiles = /* @__PURE__ */ new Map();
    for (const line of revertLog.split("\n")) {
      const file = line.trim();
      if (!file) continue;
      revertFiles.set(file, (revertFiles.get(file) ?? 0) + 1);
    }
    const frequentReverts = [...revertFiles.entries()].filter(([_, count]) => count >= 2);
    if (frequentReverts.length > 0) {
      profile.insights.push({
        type: "revert-prone",
        message: `Files frequently reverted: ${frequentReverts.map(([f]) => f).join(", ")}. Be extra careful with changes.`,
        files: frequentReverts.map(([f]) => f),
        severity: "important"
      });
    }
  }
  const mergeLog = runGit(rootDir, 'log --since="6 months ago" --merges --name-only --pretty=format:');
  if (mergeLog) {
    const mergeFiles = /* @__PURE__ */ new Map();
    for (const line of mergeLog.split("\n")) {
      const file = line.trim();
      if (!file) continue;
      mergeFiles.set(file, (mergeFiles.get(file) ?? 0) + 1);
    }
    const conflictProne = [...mergeFiles.entries()].filter(([_, count]) => count >= 5).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (conflictProne.length > 0) {
      profile.insights.push({
        type: "conflict-zone",
        message: `Frequent merge conflict zones: ${conflictProne.map(([f]) => f).join(", ")}`,
        files: conflictProne.map(([f]) => f),
        severity: "nice-to-have"
      });
    }
  }
  const contributorOutput = runGit(rootDir, 'shortlog -sn --since="3 months ago" HEAD');
  if (contributorOutput) {
    profile.recentContributors = contributorOutput.split("\n").filter((l) => l.trim()).length;
  }
  return profile;
}

// src/analyzers/index.ts
async function analyzeCodebase(opts) {
  const { rootDir, framework, skipGit } = opts;
  const stack = await detectStack(rootDir, framework);
  const [architecture, commands, database, testing, gotchas, environment, cicd, gitHistory] = await Promise.all([
    safeAnalyze("architecture", () => analyzeArchitecture(rootDir, stack)),
    safeAnalyze("commands", () => analyzeCommands(rootDir, stack)),
    safeAnalyze("database", () => analyzeDatabase(rootDir, stack)),
    safeAnalyze("testing", () => analyzeTesting(rootDir, stack)),
    safeAnalyze("gotchas", () => analyzeGotchas(rootDir, stack)),
    safeAnalyze("environment", () => analyzeEnvironment(rootDir)),
    safeAnalyze("cicd", () => analyzeCiCd(rootDir)),
    skipGit ? Promise.resolve({ isGitRepo: false, insights: [], topChangedFiles: [], recentContributors: 0 }) : safeAnalyze("gitHistory", () => analyzeGitHistory(rootDir))
  ]);
  return {
    rootDir,
    stack,
    architecture,
    commands,
    database,
    testing,
    gotchas,
    environment,
    cicd,
    gitHistory,
    analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function safeAnalyze(name, fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn(
      `[warn] Analyzer "${name}" failed: ${err instanceof Error ? err.message : err}`
    );
    return {};
  }
}

// src/token/index.ts
var encoder = null;
var initAttempted = false;
async function getEncoder() {
  if (encoder) return encoder;
  if (initAttempted) return null;
  initAttempted = true;
  try {
    const tiktoken = await import("tiktoken");
    encoder = tiktoken.get_encoding("cl100k_base");
    return encoder;
  } catch {
    return null;
  }
}
async function countTokens(text) {
  const enc = await getEncoder();
  if (enc) {
    return enc.encode(text).length;
  }
  return estimateTokens(text);
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export {
  detectStack,
  analyzeCodebase,
  countTokens,
  estimateTokens
};
