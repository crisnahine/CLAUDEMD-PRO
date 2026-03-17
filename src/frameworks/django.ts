/**
 * Django Deep Analyzer
 *
 * Detects Django-specific patterns, middleware, apps, REST framework,
 * Celery task queues, admin customization, and common gotchas.
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

function findDjangoSettings(rootDir: string): string | null {
  // Django settings can live in many places:
  // <project>/settings.py, config/settings.py, config/settings/base.py, settings/base.py
  const candidates = [
    "config/settings.py",
    "config/settings/base.py",
    "config/settings/common.py",
    "settings.py",
    "settings/base.py",
  ];

  for (const c of candidates) {
    if (existsSync(join(rootDir, c))) return c;
  }

  // Fallback: scan top-level dirs for a settings.py
  try {
    const entries = readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const candidate = join(entry.name, "settings.py");
      if (existsSync(join(rootDir, candidate))) return candidate;
      // Split settings pattern
      const splitCandidate = join(entry.name, "settings", "base.py");
      if (existsSync(join(rootDir, splitCandidate))) return splitCandidate;
    }
  } catch { /* permission denied */ }

  return null;
}

function findDjangoProject(rootDir: string): string | null {
  // Find the project package (contains wsgi.py or asgi.py)
  try {
    const entries = readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (
        existsSync(join(rootDir, entry.name, "wsgi.py")) ||
        existsSync(join(rootDir, entry.name, "asgi.py"))
      ) {
        return entry.name;
      }
    }
  } catch { /* permission denied */ }
  return null;
}

// ─── Analyzer ───────────────────────────────────────────────

export function analyzeDjango(
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

  const settingsPath = findDjangoSettings(rootDir);
  const settings = settingsPath ? readSafe(join(rootDir, settingsPath)) : null;
  const projectPkg = findDjangoProject(rootDir);

  // ─── Entry Points ──────────────────────────────────────────

  if (existsSync(join(rootDir, "manage.py"))) {
    enrichment.entryPoints.push("manage.py");
  }
  if (settingsPath) {
    enrichment.entryPoints.push(settingsPath);
  }
  if (projectPkg) {
    const urlsCandidates = [
      `${projectPkg}/urls.py`,
      "config/urls.py",
      "urls.py",
    ];
    for (const u of urlsCandidates) {
      if (existsSync(join(rootDir, u))) {
        enrichment.entryPoints.push(u);
        break;
      }
    }
    if (existsSync(join(rootDir, projectPkg, "wsgi.py"))) {
      enrichment.entryPoints.push(`${projectPkg}/wsgi.py`);
    }
    if (existsSync(join(rootDir, projectPkg, "asgi.py"))) {
      enrichment.entryPoints.push(`${projectPkg}/asgi.py`);
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "templates/": "Django HTML templates (Jinja2/DTL)",
    "static/": "Static assets (CSS, JS, images) — collected by collectstatic",
    "staticfiles/": "Collected static files output (DON'T edit)",
    "media/": "User-uploaded files",
    "locale/": "i18n translation files",
    "fixtures/": "JSON/YAML data for loaddata",
  };

  if (projectPkg) {
    enrichment.dirPurposes[`${projectPkg}/`] = "Django project config package (settings, urls, wsgi)";
  }

  // Detect Django apps (dirs with models.py or apps.py)
  try {
    const entries = readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const dirPath = join(rootDir, entry.name);
      if (
        existsSync(join(dirPath, "apps.py")) ||
        (existsSync(join(dirPath, "models.py")) && existsSync(join(dirPath, "views.py")))
      ) {
        enrichment.dirPurposes[`${entry.name}/`] = "Django app";

        // Detect sub-purposes within apps
        if (existsSync(join(dirPath, "models.py"))) {
          enrichment.dirPurposes[`${entry.name}/models.py`] = "Database models (ORM)";
        }
        if (existsSync(join(dirPath, "views.py"))) {
          enrichment.dirPurposes[`${entry.name}/views.py`] = "View handlers (controllers)";
        }
        if (existsSync(join(dirPath, "urls.py"))) {
          enrichment.dirPurposes[`${entry.name}/urls.py`] = "URL routing for this app";
        }
        if (existsSync(join(dirPath, "admin.py"))) {
          enrichment.dirPurposes[`${entry.name}/admin.py`] = "Admin panel customization";
        }
        if (existsSync(join(dirPath, "serializers.py"))) {
          enrichment.dirPurposes[`${entry.name}/serializers.py`] = "DRF API serializers";
        }
        if (existsSync(join(dirPath, "signals.py"))) {
          enrichment.dirPurposes[`${entry.name}/signals.py`] = "Django signals (post_save, etc.)";
        }
        if (existsSync(join(dirPath, "tasks.py"))) {
          enrichment.dirPurposes[`${entry.name}/tasks.py`] = "Celery async tasks";
        }
        if (existsSync(join(dirPath, "forms.py"))) {
          enrichment.dirPurposes[`${entry.name}/forms.py`] = "Django forms / model forms";
        }
        if (existsSync(join(dirPath, "managers.py"))) {
          enrichment.dirPurposes[`${entry.name}/managers.py`] = "Custom model managers / querysets";
        }
        if (existsSync(join(dirPath, "middleware.py"))) {
          enrichment.dirPurposes[`${entry.name}/middleware.py`] = "Custom middleware";
        }
        if (existsSync(join(dirPath, "permissions.py"))) {
          enrichment.dirPurposes[`${entry.name}/permissions.py`] = "DRF custom permissions";
        }

        // Check for migrations inside app
        if (existsSync(join(dirPath, "migrations"))) {
          enrichment.dirPurposes[`${entry.name}/migrations/`] = "Auto-generated migrations (DON'T manually edit)";
        }
      }
    }
  } catch { /* permission denied */ }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    { name: "djangorestframework", pattern: "rest_framework", label: "Django REST Framework (API)" },
    { name: "django-ninja", pattern: "ninja", label: "Django Ninja (fast API)" },
    { name: "celery", pattern: "celery", label: "Celery (async task queue)" },
    { name: "django-celery-beat", pattern: "django_celery_beat", label: "Celery Beat (periodic tasks)" },
    { name: "django-allauth", pattern: "allauth", label: "django-allauth (auth/social login)" },
    { name: "django-cors-headers", pattern: "corsheaders", label: "CORS headers middleware" },
    { name: "django-crispy-forms", pattern: "crispy_forms", label: "Crispy Forms (form rendering)" },
    { name: "django-filter", pattern: "django_filters", label: "django-filter (queryset filtering)" },
    { name: "django-debug-toolbar", pattern: "debug_toolbar", label: "Django Debug Toolbar" },
    { name: "django-extensions", pattern: "django_extensions", label: "Django Extensions" },
    { name: "django-storages", pattern: "storages", label: "django-storages (S3/GCS file backends)" },
    { name: "whitenoise", pattern: "whitenoise", label: "WhiteNoise (static file serving)" },
    { name: "gunicorn", pattern: "gunicorn", label: "Gunicorn (production WSGI server)" },
    { name: "uvicorn", pattern: "uvicorn", label: "Uvicorn (ASGI server)" },
    { name: "daphne", pattern: "daphne", label: "Daphne (ASGI server for Channels)" },
    { name: "channels", pattern: "channels", label: "Django Channels (WebSockets)" },
    { name: "django-oauth-toolkit", pattern: "oauth2_provider", label: "OAuth2 provider" },
    { name: "django-import-export", pattern: "import_export", label: "Import/Export (admin data)" },
    { name: "django-redis", pattern: "django_redis", label: "Redis cache backend" },
    { name: "django-cacheops", pattern: "cacheops", label: "Cacheops (ORM caching)" },
    { name: "sentry-sdk", pattern: "sentry_sdk", label: "Sentry (error tracking)" },
    { name: "django-simple-history", pattern: "simple_history", label: "Model change tracking" },
    { name: "django-guardian", pattern: "guardian", label: "Object-level permissions" },
    { name: "django-environ", pattern: "environ", label: "django-environ (env vars)" },
    { name: "django-health-check", pattern: "health_check", label: "Health check endpoints" },
    { name: "django-waffle", pattern: "waffle", label: "Feature flags" },
  ];

  // Check requirements.txt, pyproject.toml, and settings for these deps
  const reqFile = readSafe(join(rootDir, "requirements.txt")) ?? "";
  const reqDev = readSafe(join(rootDir, "requirements-dev.txt")) ?? "";
  const pyproject = readSafe(join(rootDir, "pyproject.toml")) ?? "";
  const allReqs = `${reqFile}\n${reqDev}\n${pyproject}`.toLowerCase();

  for (const dep of depChecks) {
    if (allReqs.includes(dep.name) || (settings && settings.includes(dep.pattern))) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  // Settings-based pattern detection
  if (settings) {
    if (settings.includes("REST_FRAMEWORK")) {
      enrichment.patterns.push({ check: "REST_FRAMEWORK in settings", label: "Django REST Framework API" });
    }
    if (settings.includes("CHANNEL_LAYERS")) {
      enrichment.patterns.push({ check: "CHANNEL_LAYERS in settings", label: "Django Channels (WebSockets)" });
    }
    if (settings.includes("CELERY") || settings.includes("celery_app")) {
      enrichment.patterns.push({ check: "Celery config in settings", label: "Celery async task queue" });
    }
    if (settings.includes("CACHES") && settings.includes("redis")) {
      enrichment.patterns.push({ check: "Redis in CACHES", label: "Redis caching layer" });
    }
    if (settings.includes("django.middleware.locale")) {
      enrichment.patterns.push({ check: "locale middleware", label: "i18n / multi-language support" });
    }
    if (settings.includes("STATICFILES_STORAGE") && settings.includes("whitenoise")) {
      enrichment.patterns.push({ check: "WhiteNoise staticfiles", label: "WhiteNoise static file serving" });
    }
    if (/AUTH_USER_MODEL\s*=/.test(settings)) {
      enrichment.patterns.push({ check: "AUTH_USER_MODEL override", label: "Custom User model" });
    }

    // Split settings pattern
    if (settingsPath && settingsPath.includes("/settings/")) {
      enrichment.patterns.push({ check: "settings/ directory", label: "Split settings (base/dev/prod)" });
    }
  }

  // File-based pattern detection
  if (existsSync(join(rootDir, "celery_app.py")) || existsSync(join(rootDir, projectPkg ?? "", "celery.py"))) {
    enrichment.patterns.push({ check: "celery.py exists", label: "Celery worker configuration" });
  }

  const conftest = findFile(rootDir, ["conftest.py", "tests/conftest.py"]);
  if (conftest) {
    enrichment.patterns.push({ check: "conftest.py exists", label: "Pytest fixtures (conftest.py)" });
  }

  if (existsSync(join(rootDir, "Procfile"))) {
    enrichment.patterns.push({ check: "Procfile exists", label: "Procfile-based deployment (Heroku/Render)" });
  }

  if (existsSync(join(rootDir, "docker-compose.yml")) || existsSync(join(rootDir, "compose.yml"))) {
    enrichment.patterns.push({ check: "docker-compose exists", label: "Docker Compose development environment" });
  }

  // ─── Commands ──────────────────────────────────────────────

  enrichment.commands.push(
    { command: "python manage.py runserver", description: "Start Django dev server (port 8000)", category: "dev" },
    { command: "python manage.py test", description: "Run Django test suite", category: "test" },
    { command: "python manage.py makemigrations", description: "Generate new migrations from model changes", category: "db" },
    { command: "python manage.py migrate", description: "Apply pending database migrations", category: "db" },
    { command: "python manage.py createsuperuser", description: "Create admin superuser", category: "other" },
    { command: "python manage.py shell", description: "Interactive Django shell (ORM access)", category: "dev" },
    { command: "python manage.py collectstatic", description: "Collect static files for production", category: "build" },
    { command: "python manage.py showmigrations", description: "List migration status per app", category: "db" },
    { command: "python manage.py check --deploy", description: "Verify deployment-readiness settings", category: "deploy" },
  );

  // Detect poetry/pipenv/uv and adjust command prefix
  const hasPyprojectPoetry = pyproject.includes("[tool.poetry]");
  const hasPipfile = existsSync(join(rootDir, "Pipfile"));
  const hasUv = pyproject.includes("[tool.uv]");

  if (hasPyprojectPoetry) {
    enrichment.commands.push(
      { command: "poetry install", description: "Install Python dependencies", category: "build" },
      { command: "poetry run python manage.py runserver", description: "Start dev server via Poetry", category: "dev" },
    );
  } else if (hasPipfile) {
    enrichment.commands.push(
      { command: "pipenv install", description: "Install Python dependencies", category: "build" },
    );
  } else if (hasUv) {
    enrichment.commands.push(
      { command: "uv sync", description: "Install/sync Python dependencies", category: "build" },
    );
  } else {
    enrichment.commands.push(
      { command: "pip install -r requirements.txt", description: "Install Python dependencies", category: "build" },
    );
  }

  // Celery
  if (allReqs.includes("celery")) {
    enrichment.commands.push(
      { command: "celery -A config worker -l info", description: "Start Celery worker", category: "dev" },
      { command: "celery -A config beat -l info", description: "Start Celery Beat scheduler", category: "dev" },
    );
  }

  // Linting
  if (allReqs.includes("ruff")) {
    enrichment.commands.push(
      { command: "ruff check .", description: "Lint Python code with Ruff", category: "lint" },
      { command: "ruff format .", description: "Format Python code with Ruff", category: "lint" },
    );
  } else if (allReqs.includes("flake8")) {
    enrichment.commands.push(
      { command: "flake8 .", description: "Lint Python code with flake8", category: "lint" },
    );
  }
  if (allReqs.includes("black")) {
    enrichment.commands.push(
      { command: "black .", description: "Format Python code with Black", category: "lint" },
    );
  }
  if (allReqs.includes("isort")) {
    enrichment.commands.push(
      { command: "isort .", description: "Sort Python imports", category: "lint" },
    );
  }
  if (allReqs.includes("mypy")) {
    enrichment.commands.push(
      { command: "mypy .", description: "Run static type checking", category: "lint" },
    );
  }

  // Pytest
  if (allReqs.includes("pytest")) {
    enrichment.commands.push(
      { command: "pytest", description: "Run tests with pytest", category: "test" },
      { command: "pytest --cov", description: "Run tests with coverage report", category: "test" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  enrichment.database = {
    ormName: "Django ORM",
    migrationDir: "*/migrations/",
  };

  if (settings) {
    if (settings.includes("postgresql") || settings.includes("psycopg")) {
      enrichment.database.schemaFile = settingsPath ?? undefined;
    }
  }

  // ─── Testing ───────────────────────────────────────────────

  if (allReqs.includes("pytest") || allReqs.includes("pytest-django")) {
    enrichment.testing = {
      framework: "pytest + pytest-django",
      testDir: existsSync(join(rootDir, "tests")) ? "tests" : "*/tests.py",
      systemTestTools: [],
    };
    if (allReqs.includes("selenium")) enrichment.testing.systemTestTools!.push("Selenium");
    if (allReqs.includes("playwright")) enrichment.testing.systemTestTools!.push("Playwright");
    if (allReqs.includes("factory_boy") || allReqs.includes("factory-boy")) {
      enrichment.testing.systemTestTools!.push("factory_boy (test factories)");
    }
    if (allReqs.includes("faker")) enrichment.testing.systemTestTools!.push("Faker (test data)");
  } else {
    enrichment.testing = {
      framework: "Django TestCase (unittest)",
      testDir: "*/tests.py",
    };
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T edit migration files directly",
      reason: "Migrations are auto-generated by `makemigrations`. Manual edits cause migration conflicts. Use `makemigrations --merge` for conflicts",
      severity: "critical",
    },
    {
      rule: "DON'T add model fields without migrations",
      reason: "Every model change needs `python manage.py makemigrations` then `migrate`. Django will crash at runtime if the schema is out of sync",
      severity: "critical",
    },
    {
      rule: "DON'T store secrets in settings.py",
      reason: "Use environment variables (django-environ or os.getenv). settings.py is committed to version control",
      severity: "critical",
    },
    {
      rule: "DON'T forget to add new apps to INSTALLED_APPS",
      reason: "Django will silently ignore models, admin, signals, and templates from apps not registered in INSTALLED_APPS",
      severity: "critical",
    },
    {
      rule: "DON'T use `ForeignKey` without `on_delete`",
      reason: "Django requires an explicit on_delete argument (CASCADE, SET_NULL, PROTECT, etc.)",
      severity: "critical",
    },
    {
      rule: "DON'T use `objects.get()` without try/except or `.filter().first()`",
      reason: "`.get()` raises DoesNotExist if no match — use `.filter().first()` or catch the exception",
      severity: "important",
    },
    {
      rule: "DON'T query the database in model __init__ or __str__",
      reason: "This triggers extra queries every time objects are instantiated or printed, causing N+1 problems",
      severity: "important",
    },
    {
      rule: "DON'T skip `select_related()` / `prefetch_related()`",
      reason: "Related object access in templates/serializers causes N+1 queries. Always prefetch",
      severity: "important",
    },
    {
      rule: "DON'T modify staticfiles/ output directory",
      reason: "staticfiles/ is auto-generated by `collectstatic`. Edit files in static/ instead",
      severity: "important",
    },
    {
      rule: "ALWAYS run `collectstatic` before deployment",
      reason: "Production serves from the collected static directory, not the source static/ dirs",
      severity: "important",
    },
    {
      rule: "ALWAYS set `DEBUG = False` in production",
      reason: "DEBUG = True exposes full stack traces, settings values, and SQL queries to users",
      severity: "critical",
    },
  );

  // DRF-specific gotchas
  if (allReqs.includes("djangorestframework") || (settings && settings.includes("rest_framework"))) {
    enrichment.gotchas.push(
      {
        rule: "DON'T forget authentication/permission classes on DRF views",
        reason: "Views default to AllowAny unless REST_FRAMEWORK default_permission_classes is set. Explicitly set permission_classes on every APIView",
        severity: "critical",
      },
      {
        rule: "DON'T use ModelSerializer without specifying `fields` explicitly",
        reason: "Using fields = '__all__' or omitting fields can expose sensitive model data (passwords, tokens, internal IDs)",
        severity: "critical",
      },
    );
  }

  // Celery-specific gotchas
  if (allReqs.includes("celery")) {
    enrichment.gotchas.push(
      {
        rule: "DON'T pass ORM model instances to Celery tasks",
        reason: "Pass IDs and re-query inside the task. Model instances can be stale or unpicklable by the time the worker processes them",
        severity: "important",
      },
    );
  }

  // Custom User model gotcha
  if (settings && /AUTH_USER_MODEL/.test(settings)) {
    enrichment.gotchas.push({
      rule: "DON'T import User from `django.contrib.auth.models`",
      reason: "This project uses a custom user model. Use `from django.contrib.auth import get_user_model; User = get_user_model()`",
      severity: "critical",
    });
  }

  return enrichment;
}
