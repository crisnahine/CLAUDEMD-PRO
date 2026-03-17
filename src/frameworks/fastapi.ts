/**
 * FastAPI / Flask Deep Analyzer
 *
 * Detects async patterns, SQLAlchemy/Alembic, Pydantic models,
 * dependency injection, Blueprint/Router structure, and common gotchas.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────

export interface FrameworkEnrichment {
  gotchas: Array<{ rule: string; reason: string; severity: "critical" | "important" | "nice-to-have" }>;
  dirPurposes: Record<string, string>;
  notableDeps: Array<{ name: string; pattern: string; label: string }>;
  entryPoints: string[];
  patterns: Array<{ check: string; label: string }>;
  commands: Array<{ command: string; description: string; category: "dev" | "test" | "build" | "lint" | "db" | "deploy" | "other" }>;
  database?: { ormName: string; schemaFile?: string; migrationDir?: string };
  testing?: { framework: string; testDir: string; systemTestTools?: string[] };
}

// ─── Helpers ────────────────────────────────────────────────

function readSafe(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : null;
  } catch {
    return null;
  }
}

function findFile(rootDir: string, candidates: string[]): string | null {
  for (const c of candidates) {
    if (existsSync(join(rootDir, c))) return c;
  }
  return null;
}

type TargetFramework = "fastapi" | "flask";

function detectSubFramework(rootDir: string, keyDeps: Record<string, string>): TargetFramework {
  const reqFile = readSafe(join(rootDir, "requirements.txt")) ?? "";
  const pyproject = readSafe(join(rootDir, "pyproject.toml")) ?? "";
  const allReqs = `${reqFile}\n${pyproject}`.toLowerCase();

  if (allReqs.includes("fastapi") || keyDeps["fastapi"]) return "fastapi";
  return "flask";
}

// ─── Analyzer ───────────────────────────────────────────────

export function analyzeFastApi(
  rootDir: string,
  keyDeps: Record<string, string>
): FrameworkEnrichment {
  const enrichment: FrameworkEnrichment = {
    gotchas: [],
    dirPurposes: {},
    notableDeps: [],
    entryPoints: [],
    patterns: [],
    commands: [],
  };

  const fw = detectSubFramework(rootDir, keyDeps);
  const isFastAPI = fw === "fastapi";

  const reqFile = readSafe(join(rootDir, "requirements.txt")) ?? "";
  const reqDev = readSafe(join(rootDir, "requirements-dev.txt")) ?? "";
  const pyproject = readSafe(join(rootDir, "pyproject.toml")) ?? "";
  const allReqs = `${reqFile}\n${reqDev}\n${pyproject}`.toLowerCase();

  // ─── Entry Points ──────────────────────────────────────────

  const appCandidates = isFastAPI
    ? ["app/main.py", "src/main.py", "main.py", "app/__init__.py", "src/app.py", "api/main.py"]
    : ["app.py", "application.py", "wsgi.py", "app/__init__.py", "src/app.py", "run.py", "manage.py"];

  for (const c of appCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
      break;
    }
  }

  // Alembic config
  if (existsSync(join(rootDir, "alembic.ini"))) {
    enrichment.entryPoints.push("alembic.ini");
  }

  // Alembic env
  const alembicEnv = findFile(rootDir, ["alembic/env.py", "migrations/env.py"]);
  if (alembicEnv) {
    enrichment.entryPoints.push(alembicEnv);
  }

  // ─── Directory Purposes ────────────────────────────────────

  if (isFastAPI) {
    enrichment.dirPurposes = {
      "app/": "Application package (main FastAPI app)",
      "app/api/": "API route handlers (routers)",
      "app/api/v1/": "API v1 versioned endpoints",
      "app/core/": "Core config, security, and shared utilities",
      "app/models/": "SQLAlchemy / ORM models",
      "app/schemas/": "Pydantic request/response schemas",
      "app/crud/": "CRUD database operations",
      "app/services/": "Business logic services",
      "app/deps/": "FastAPI dependency injection functions",
      "app/middleware/": "Custom middleware (CORS, auth, logging)",
      "app/tasks/": "Background tasks (Celery/ARQ/etc.)",
      "app/utils/": "Utility functions",
      "alembic/": "Alembic database migration scripts",
      "alembic/versions/": "Individual migration files (auto-generated)",
      "tests/": "Test suite",
    };
  } else {
    enrichment.dirPurposes = {
      "app/": "Flask application package",
      "app/blueprints/": "Flask Blueprint modules",
      "app/models/": "SQLAlchemy models",
      "app/views/": "View functions / route handlers",
      "app/forms/": "WTForms form classes",
      "app/templates/": "Jinja2 HTML templates",
      "app/static/": "Static assets (CSS, JS, images)",
      "app/services/": "Business logic services",
      "app/extensions/": "Flask extension initialization",
      "app/utils/": "Utility functions",
      "migrations/": "Flask-Migrate/Alembic migration scripts",
      "migrations/versions/": "Individual migration files (auto-generated)",
      "instance/": "Instance-specific config (DON'T commit)",
      "tests/": "Test suite",
    };
  }

  // Detect common dirs that exist
  const commonDirs = ["api", "routers", "endpoints", "schemas", "models", "crud", "core", "services", "utils"];
  for (const dir of commonDirs) {
    for (const prefix of ["app", "src", ""]) {
      const fullDir = prefix ? join(prefix, dir) : dir;
      if (existsSync(join(rootDir, fullDir)) && !enrichment.dirPurposes[`${fullDir}/`]) {
        enrichment.dirPurposes[`${fullDir}/`] = `${dir.charAt(0).toUpperCase() + dir.slice(1)} modules`;
      }
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = isFastAPI
    ? [
        { name: "uvicorn", pattern: "uvicorn", label: "Uvicorn (ASGI server)" },
        { name: "sqlalchemy", pattern: "sqlalchemy", label: "SQLAlchemy (ORM)" },
        { name: "alembic", pattern: "alembic", label: "Alembic (migrations)" },
        { name: "pydantic", pattern: "pydantic", label: "Pydantic (data validation)" },
        { name: "pydantic-settings", pattern: "pydantic_settings", label: "Pydantic Settings (config)" },
        { name: "httpx", pattern: "httpx", label: "httpx (async HTTP client)" },
        { name: "celery", pattern: "celery", label: "Celery (task queue)" },
        { name: "arq", pattern: "arq", label: "ARQ (async task queue)" },
        { name: "fastapi-users", pattern: "fastapi_users", label: "FastAPI Users (auth)" },
        { name: "python-jose", pattern: "jose", label: "python-jose (JWT tokens)" },
        { name: "passlib", pattern: "passlib", label: "passlib (password hashing)" },
        { name: "python-multipart", pattern: "multipart", label: "python-multipart (form data/file uploads)" },
        { name: "redis", pattern: "redis", label: "Redis client" },
        { name: "aioredis", pattern: "aioredis", label: "Async Redis client" },
        { name: "boto3", pattern: "boto3", label: "AWS SDK (S3, SQS, etc.)" },
        { name: "sentry-sdk", pattern: "sentry", label: "Sentry (error tracking)" },
        { name: "strawberry-graphql", pattern: "strawberry", label: "Strawberry (GraphQL)" },
        { name: "tortoise-orm", pattern: "tortoise", label: "Tortoise ORM (async)" },
        { name: "sqlmodel", pattern: "sqlmodel", label: "SQLModel (SQLAlchemy + Pydantic)" },
        { name: "databases", pattern: "databases", label: "databases (async DB)" },
      ]
    : [
        { name: "gunicorn", pattern: "gunicorn", label: "Gunicorn (WSGI server)" },
        { name: "flask-sqlalchemy", pattern: "flask_sqlalchemy", label: "Flask-SQLAlchemy (ORM)" },
        { name: "flask-migrate", pattern: "flask_migrate", label: "Flask-Migrate (Alembic wrapper)" },
        { name: "flask-login", pattern: "flask_login", label: "Flask-Login (session auth)" },
        { name: "flask-wtf", pattern: "flask_wtf", label: "Flask-WTF (forms / CSRF)" },
        { name: "flask-cors", pattern: "flask_cors", label: "Flask-CORS" },
        { name: "flask-mail", pattern: "flask_mail", label: "Flask-Mail (email)" },
        { name: "flask-caching", pattern: "flask_caching", label: "Flask-Caching" },
        { name: "flask-jwt-extended", pattern: "flask_jwt_extended", label: "Flask-JWT-Extended (JWT auth)" },
        { name: "flask-restful", pattern: "flask_restful", label: "Flask-RESTful (REST API)" },
        { name: "flask-marshmallow", pattern: "flask_marshmallow", label: "Flask-Marshmallow (serialization)" },
        { name: "flask-socketio", pattern: "flask_socketio", label: "Flask-SocketIO (WebSockets)" },
        { name: "flask-admin", pattern: "flask_admin", label: "Flask-Admin (admin panel)" },
        { name: "celery", pattern: "celery", label: "Celery (task queue)" },
        { name: "redis", pattern: "redis", label: "Redis client" },
        { name: "sentry-sdk", pattern: "sentry", label: "Sentry (error tracking)" },
        { name: "alembic", pattern: "alembic", label: "Alembic (direct migrations)" },
        { name: "sqlalchemy", pattern: "sqlalchemy", label: "SQLAlchemy (ORM)" },
      ];

  for (const dep of depChecks) {
    if (allReqs.includes(dep.name)) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  if (isFastAPI) {
    // Check for async def patterns
    const mainFile = findFile(rootDir, ["app/main.py", "src/main.py", "main.py"]);
    const mainContent = mainFile ? readSafe(join(rootDir, mainFile)) : null;

    if (mainContent) {
      if (/async\s+def/.test(mainContent)) {
        enrichment.patterns.push({ check: "async def in main", label: "Async endpoint handlers" });
      }
      if (mainContent.includes("Depends(")) {
        enrichment.patterns.push({ check: "Depends() usage", label: "FastAPI dependency injection" });
      }
      if (mainContent.includes("APIRouter")) {
        enrichment.patterns.push({ check: "APIRouter usage", label: "Router-based route organization" });
      }
      if (mainContent.includes("CORSMiddleware")) {
        enrichment.patterns.push({ check: "CORSMiddleware", label: "CORS middleware configured" });
      }
      if (mainContent.includes("include_router")) {
        enrichment.patterns.push({ check: "include_router", label: "Modular router includes" });
      }
    }

    if (existsSync(join(rootDir, "app/schemas")) || existsSync(join(rootDir, "src/schemas"))) {
      enrichment.patterns.push({ check: "schemas/ directory", label: "Pydantic schema separation" });
    }
    if (existsSync(join(rootDir, "app/crud")) || existsSync(join(rootDir, "src/crud"))) {
      enrichment.patterns.push({ check: "crud/ directory", label: "CRUD repository pattern" });
    }
    if (existsSync(join(rootDir, "app/api/v1")) || existsSync(join(rootDir, "api/v1"))) {
      enrichment.patterns.push({ check: "api/v1/ directory", label: "API versioning" });
    }
  } else {
    // Flask patterns
    const appInit = readSafe(join(rootDir, "app/__init__.py"));
    if (appInit) {
      if (appInit.includes("create_app")) {
        enrichment.patterns.push({ check: "create_app factory", label: "Application factory pattern" });
      }
      if (appInit.includes("register_blueprint") || appInit.includes("Blueprint")) {
        enrichment.patterns.push({ check: "Blueprint usage", label: "Blueprint-based modular structure" });
      }
    }

    if (existsSync(join(rootDir, "app/templates"))) {
      enrichment.patterns.push({ check: "templates/ directory", label: "Jinja2 server-side templates" });
    }
    if (existsSync(join(rootDir, "instance"))) {
      enrichment.patterns.push({ check: "instance/ directory", label: "Instance-specific configuration" });
    }
  }

  // Common patterns
  if (existsSync(join(rootDir, "alembic")) || existsSync(join(rootDir, "migrations"))) {
    enrichment.patterns.push({ check: "alembic/ or migrations/", label: "Alembic database migrations" });
  }
  if (existsSync(join(rootDir, "Dockerfile"))) {
    enrichment.patterns.push({ check: "Dockerfile", label: "Docker containerization" });
  }
  if (existsSync(join(rootDir, "Procfile"))) {
    enrichment.patterns.push({ check: "Procfile", label: "Procfile-based deployment" });
  }

  // ─── Commands ──────────────────────────────────────────────

  if (isFastAPI) {
    enrichment.commands.push(
      { command: "uvicorn app.main:app --reload", description: "Start FastAPI dev server with hot reload", category: "dev" },
      { command: "uvicorn app.main:app --host 0.0.0.0 --port 8000", description: "Start FastAPI for production", category: "deploy" },
    );
  } else {
    enrichment.commands.push(
      { command: "flask run --debug", description: "Start Flask dev server with debugger", category: "dev" },
      { command: "gunicorn 'app:create_app()'", description: "Start Flask via Gunicorn (production)", category: "deploy" },
    );

    if (allReqs.includes("flask-migrate")) {
      enrichment.commands.push(
        { command: "flask db migrate -m 'description'", description: "Generate Alembic migration from model changes", category: "db" },
        { command: "flask db upgrade", description: "Apply pending database migrations", category: "db" },
        { command: "flask db downgrade", description: "Rollback last migration", category: "db" },
        { command: "flask db history", description: "Show migration history", category: "db" },
      );
    }
  }

  // Alembic (standalone, not Flask-Migrate)
  if (existsSync(join(rootDir, "alembic.ini"))) {
    enrichment.commands.push(
      { command: "alembic revision --autogenerate -m 'description'", description: "Generate Alembic migration from model changes", category: "db" },
      { command: "alembic upgrade head", description: "Apply all pending migrations", category: "db" },
      { command: "alembic downgrade -1", description: "Rollback last migration", category: "db" },
      { command: "alembic history", description: "Show migration history", category: "db" },
      { command: "alembic current", description: "Show current migration revision", category: "db" },
    );
  }

  // Python tooling commands
  const hasPyprojectPoetry = pyproject.includes("[tool.poetry]");
  const hasUv = pyproject.includes("[tool.uv]");

  if (hasPyprojectPoetry) {
    enrichment.commands.push({ command: "poetry install", description: "Install Python dependencies", category: "build" });
  } else if (hasUv) {
    enrichment.commands.push({ command: "uv sync", description: "Install/sync Python dependencies", category: "build" });
  } else {
    enrichment.commands.push({ command: "pip install -r requirements.txt", description: "Install Python dependencies", category: "build" });
  }

  // Testing
  if (allReqs.includes("pytest")) {
    enrichment.commands.push(
      { command: "pytest", description: "Run test suite", category: "test" },
      { command: "pytest -x -v", description: "Run tests (stop on first failure, verbose)", category: "test" },
      { command: "pytest --cov=app", description: "Run tests with coverage report", category: "test" },
    );
  }

  // Linting
  if (allReqs.includes("ruff")) {
    enrichment.commands.push(
      { command: "ruff check .", description: "Lint Python code with Ruff", category: "lint" },
      { command: "ruff format .", description: "Format Python code with Ruff", category: "lint" },
    );
  }
  if (allReqs.includes("mypy")) {
    enrichment.commands.push({ command: "mypy .", description: "Run static type checking", category: "lint" });
  }
  if (allReqs.includes("black")) {
    enrichment.commands.push({ command: "black .", description: "Format Python code with Black", category: "lint" });
  }

  // Pre-commit
  if (existsSync(join(rootDir, ".pre-commit-config.yaml"))) {
    enrichment.commands.push({ command: "pre-commit run --all-files", description: "Run all pre-commit hooks", category: "lint" });
  }

  // ─── Database ──────────────────────────────────────────────

  if (allReqs.includes("sqlalchemy") || allReqs.includes("sqlmodel")) {
    enrichment.database = {
      ormName: allReqs.includes("sqlmodel") ? "SQLModel" : "SQLAlchemy",
      migrationDir: existsSync(join(rootDir, "alembic")) ? "alembic/versions" : "migrations/versions",
    };
  } else if (allReqs.includes("tortoise")) {
    enrichment.database = {
      ormName: "Tortoise ORM",
      migrationDir: "migrations",
    };
  }

  // ─── Testing ───────────────────────────────────────────────

  if (allReqs.includes("pytest")) {
    enrichment.testing = {
      framework: "pytest",
      testDir: existsSync(join(rootDir, "tests")) ? "tests" : "test",
      systemTestTools: [],
    };
    if (allReqs.includes("httpx")) enrichment.testing.systemTestTools!.push("httpx (async test client)");
    if (allReqs.includes("requests")) enrichment.testing.systemTestTools!.push("requests (test client)");
    if (allReqs.includes("factory_boy") || allReqs.includes("factory-boy")) {
      enrichment.testing.systemTestTools!.push("factory_boy (test factories)");
    }
    if (allReqs.includes("faker")) enrichment.testing.systemTestTools!.push("Faker (test data)");
    if (allReqs.includes("pytest-asyncio")) enrichment.testing.systemTestTools!.push("pytest-asyncio");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  if (isFastAPI) {
    enrichment.gotchas.push(
      {
        rule: "DON'T use sync functions for I/O-bound endpoints",
        reason: "FastAPI runs sync handlers in a threadpool. Use `async def` for endpoints that call databases, HTTP, or file I/O to avoid blocking the event loop",
        severity: "critical",
      },
      {
        rule: "DON'T import FastAPI `Depends()` from the wrong module",
        reason: "Dependencies must be functions that accept request params. Use `from fastapi import Depends` — not the Starlette version",
        severity: "important",
      },
      {
        rule: "DON'T return SQLAlchemy models directly from endpoints",
        reason: "FastAPI serializes via Pydantic. Return Pydantic schemas (response_model) — SQLAlchemy objects won't serialize properly and may leak internal fields",
        severity: "critical",
      },
      {
        rule: "DON'T create DB sessions outside of dependency injection",
        reason: "Use a `get_db` dependency to ensure sessions are properly opened/closed per request. Never create sessions at module level",
        severity: "critical",
      },
      {
        rule: "DON'T forget `response_model` on endpoints returning DB data",
        reason: "Without response_model, FastAPI returns raw dicts without validation or field filtering. Sensitive data may leak",
        severity: "important",
      },
      {
        rule: "DON'T mix async and sync SQLAlchemy sessions",
        reason: "If using async SQLAlchemy, always use `AsyncSession` and `await` queries. Mixing sync/async sessions causes deadlocks or runtime errors",
        severity: "critical",
      },
    );
  } else {
    enrichment.gotchas.push(
      {
        rule: "DON'T use `app` directly in production",
        reason: "Use Gunicorn or uWSGI as the WSGI server. Flask's built-in server is single-threaded and not production-ready",
        severity: "critical",
      },
      {
        rule: "DON'T store state on the `app` object or module globals",
        reason: "Flask runs multiple workers in production. Module-level state is not shared across processes. Use a database or cache",
        severity: "important",
      },
      {
        rule: "DON'T import `db` before `create_app()` is called",
        reason: "Flask-SQLAlchemy extensions must be initialized within the application factory. Importing before app creation causes unbound errors",
        severity: "critical",
      },
      {
        rule: "DON'T disable CSRF protection on forms",
        reason: "Flask-WTF includes CSRF by default. Disabling it opens forms to cross-site request forgery attacks",
        severity: "critical",
      },
      {
        rule: "DON'T hardcode SECRET_KEY in source code",
        reason: "SECRET_KEY is used to sign cookies and sessions. Load it from environment variables",
        severity: "critical",
      },
    );
  }

  // Common Python gotchas
  enrichment.gotchas.push(
    {
      rule: "DON'T edit Alembic migration files after they've been applied",
      reason: "Migration files are append-only. Create new migrations to fix issues. Editing applied migrations causes desync between DB and migration history",
      severity: "critical",
    },
    {
      rule: "DON'T commit .env or secrets to version control",
      reason: "Use .env.example as a template. Load config via environment variables",
      severity: "critical",
    },
    {
      rule: "DON'T forget to install python-multipart for file uploads or form data",
      reason: "FastAPI/Starlette requires python-multipart to parse form data and file uploads. It's not installed by default",
      severity: "nice-to-have",
    },
  );

  return enrichment;
}
