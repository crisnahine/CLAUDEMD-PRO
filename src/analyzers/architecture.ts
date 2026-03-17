/**
 * Architecture Analyzer
 *
 * Maps the project directory structure, identifies key directories,
 * entry points, and architectural patterns (MVC, service objects, etc.)
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { StackProfile } from "./stack-detector.js";

export interface DirectoryInfo {
  path: string;
  purpose: string; // Human-readable description
  fileCount: number;
}

export interface ArchitectureProfile {
  topLevelDirs: DirectoryInfo[];
  entryPoints: string[];
  patterns: string[]; // e.g., "service objects", "form objects", "api namespace"
  estimatedSize: "small" | "medium" | "large"; // based on file count
  totalFiles: number;
}

// Known directory purposes by convention
const DIR_PURPOSES: Record<string, Record<string, string>> = {
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
    "test": "Minitest test suite",
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
    "prisma": "Prisma ORM schema and migrations",
  },
  django: {
    "config": "Django project settings",
    "templates": "HTML templates (Jinja2/DTL)",
    "static": "Static assets (CSS/JS/images)",
    "media": "User-uploaded media",
    "locale": "Internationalization files",
    "fixtures": "Database fixtures",
    "management": "Custom management commands",
  },
  fastapi: {
    "app": "Application modules",
    "app/api": "API route handlers",
    "app/models": "SQLAlchemy/Pydantic models",
    "app/schemas": "Pydantic request/response schemas",
    "app/crud": "CRUD operations",
    "app/core": "Core configuration",
    "alembic": "Database migrations",
    "tests": "Pytest test suite",
  },
  flask: {
    "app": "Application package",
    "app/templates": "Jinja2 templates",
    "app/static": "Static files",
    "app/models": "SQLAlchemy models",
    "migrations": "Alembic/Flask-Migrate migrations",
    "tests": "Pytest test suite",
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
    "tests": "PHPUnit test suite",
  },
  spring: {
    "src/main/java": "Java source code",
    "src/main/resources": "Configuration & templates",
    "src/test/java": "Test source code",
    "src/test/resources": "Test configuration",
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
    "config": "Application configuration",
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
    "migrations": "Database migrations",
  },
  echo: {
    "cmd": "Application entry points",
    "internal": "Private application code",
    "pkg": "Public library code",
    "handlers": "HTTP handlers",
    "middleware": "HTTP middleware",
  },
  fiber: {
    "cmd": "Application entry points",
    "internal": "Private application code",
    "handlers": "HTTP handlers",
    "middleware": "HTTP middleware",
  },
  actix: {
    "src": "Rust source code",
    "src/handlers": "HTTP handlers",
    "src/models": "Data models",
    "src/middleware": "Middleware",
    "migrations": "Database migrations",
    "tests": "Integration tests",
  },
  axum: {
    "src": "Rust source code",
    "src/handlers": "Route handlers",
    "src/models": "Data models",
    "src/layers": "Tower middleware layers",
    "migrations": "Database migrations",
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
    build: "Build output",
  },
};

const IGNORE_DIRS = new Set([
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
  ".turbo",
]);

export async function analyzeArchitecture(
  rootDir: string,
  stack: StackProfile
): Promise<ArchitectureProfile> {
  const purposes = DIR_PURPOSES[stack.framework] ?? DIR_PURPOSES.generic;
  const topLevelDirs: DirectoryInfo[] = [];
  let totalFiles = 0;

  // Scan top-level and one level deep
  const entries = readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) {
      if (entry.isFile()) totalFiles++;
      continue;
    }

    const dirPath = join(rootDir, entry.name);
    const relPath = entry.name;
    const fileCount = countFiles(dirPath, 3); // 3 levels deep
    totalFiles += fileCount;

    // Check known purposes (try framework-specific first, then generic)
    const purpose =
      purposes[relPath] ?? DIR_PURPOSES.generic[relPath] ?? inferPurpose(relPath);

    topLevelDirs.push({ path: relPath, purpose, fileCount });

    // For Rails, also scan app/ subdirectories
    if (stack.framework === "rails" && relPath === "app") {
      const appEntries = readdirSync(dirPath, { withFileTypes: true });
      for (const sub of appEntries) {
        if (!sub.isDirectory()) continue;
        const subPath = `app/${sub.name}`;
        const subCount = countFiles(join(dirPath, sub.name), 2);
        const subPurpose = purposes[subPath] ?? inferPurpose(sub.name);
        topLevelDirs.push({ path: subPath, purpose: subPurpose, fileCount: subCount });
      }
    }
  }

  // Detect architectural patterns
  const patterns = detectPatterns(rootDir, stack, topLevelDirs);

  // Detect entry points
  const entryPoints = detectEntryPoints(rootDir, stack);

  // Size estimation
  const estimatedSize =
    totalFiles < 50 ? "small" : totalFiles < 500 ? "medium" : "large";

  return {
    topLevelDirs: topLevelDirs.sort((a, b) => b.fileCount - a.fileCount),
    entryPoints,
    patterns,
    estimatedSize,
    totalFiles,
  };
}

function countFiles(dir: string, maxDepth: number, depth = 0): number {
  if (depth >= maxDepth) return 0;
  let count = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.isFile()) count++;
      else if (entry.isDirectory()) {
        count += countFiles(join(dir, entry.name), maxDepth, depth + 1);
      }
    }
  } catch {
    // Permission denied, etc.
  }
  return count;
}

function inferPurpose(dirName: string): string {
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

function detectPatterns(
  rootDir: string,
  stack: StackProfile,
  dirs: DirectoryInfo[]
): string[] {
  const patterns: string[] = [];
  const dirPaths = new Set(dirs.map((d) => d.path));

  // Rails-specific patterns
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

  // JS/TS patterns
  if (stack.language === "typescript" || stack.language === "javascript") {
    if (stack.keyDeps["zustand"]) patterns.push("Zustand state management");
    if (stack.keyDeps["@reduxjs/toolkit"]) patterns.push("Redux Toolkit");
    if (stack.keyDeps["@tanstack/react-query"]) patterns.push("TanStack Query");
    if (stack.keyDeps["drizzle-orm"]) patterns.push("Drizzle ORM");
    if (stack.keyDeps["@prisma/client"]) patterns.push("Prisma ORM");
    if (stack.keyDeps["trpc"] || stack.keyDeps["@trpc/server"]) patterns.push("tRPC");
  }

  // Django patterns
  if (stack.framework === "django") {
    if (stack.keyDeps["djangorestframework"]) patterns.push("Django REST Framework");
    if (stack.keyDeps["django-ninja"]) patterns.push("Django Ninja API");
    if (stack.keyDeps["celery"]) patterns.push("Celery task queue");
    if (stack.keyDeps["django-allauth"]) patterns.push("django-allauth (auth)");
    if (stack.keyDeps["channels"]) patterns.push("Django Channels (WebSockets)");
  }

  // FastAPI patterns
  if (stack.framework === "fastapi") {
    patterns.push("Async request handling");
    if (stack.keyDeps["sqlalchemy"]) patterns.push("SQLAlchemy ORM");
    if (stack.keyDeps["celery"]) patterns.push("Celery background tasks");
  }

  // Laravel patterns
  if (stack.framework === "laravel") {
    if (dirPaths.has("app/Services")) patterns.push("Service classes");
    if (dirPaths.has("app/Actions")) patterns.push("Action classes");
    if (dirPaths.has("app/Jobs")) patterns.push("Queued jobs");
    if (stack.keyDeps["livewire/livewire"]) patterns.push("Livewire (reactive UI)");
    if (stack.keyDeps["inertiajs/inertia-laravel"]) patterns.push("Inertia.js (SPA)");
  }

  // Phoenix patterns
  if (stack.framework === "phoenix") {
    if (stack.keyDeps["phoenix_live_view"]) patterns.push("Phoenix LiveView");
    if (stack.keyDeps["oban"]) patterns.push("Oban job processing");
    if (stack.keyDeps["absinthe"]) patterns.push("Absinthe GraphQL");
    patterns.push("Ecto contexts pattern");
  }

  // Go patterns
  if (stack.language === "go") {
    if (dirPaths.has("cmd")) patterns.push("cmd/ entry point pattern");
    if (dirPaths.has("internal")) patterns.push("internal/ package encapsulation");
    if (dirPaths.has("pkg")) patterns.push("pkg/ public library pattern");
    if (stack.keyDeps["github.com/google/wire"]) patterns.push("Wire dependency injection");
  }

  // Rust patterns
  if (stack.language === "rust") {
    if (stack.keyDeps["tokio"]) patterns.push("Tokio async runtime");
    if (stack.keyDeps["tower"]) patterns.push("Tower middleware");
    if (stack.keyDeps["tracing"]) patterns.push("Structured tracing");
  }

  // Spring patterns
  if (stack.framework === "spring") {
    patterns.push("Controller → Service → Repository layers");
    if (stack.keyDeps["spring-security"]) patterns.push("Spring Security");
    if (stack.keyDeps["flyway"]) patterns.push("Flyway migrations");
    if (stack.keyDeps["liquibase"]) patterns.push("Liquibase migrations");
  }

  // General patterns
  if (dirPaths.has("docker") || dirPaths.has("docker-compose.yml")) {
    patterns.push("Docker containerization");
  }

  return patterns;
}

function detectEntryPoints(rootDir: string, stack: StackProfile): string[] {
  const entries: string[] = [];

  const candidates: Record<string, string[]> = {
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
    generic: ["src/index.ts", "src/main.ts", "index.ts", "main.ts", "src/index.js"],
  };

  const frameworkCandidates = candidates[stack.framework] ?? candidates.generic;
  for (const candidate of frameworkCandidates) {
    if (statSync(join(rootDir, candidate), { throwIfNoEntry: false })?.isFile()) {
      entries.push(candidate);
    }
  }

  return entries;
}
