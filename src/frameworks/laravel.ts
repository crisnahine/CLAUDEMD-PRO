/**
 * Laravel Deep Analyzer
 *
 * Detects Eloquent models, Blade templates, artisan commands,
 * middleware, service providers, Nova, Livewire, Inertia, and
 * Laravel-specific architectural patterns.
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

function readJson(filePath: string): Record<string, any> | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

// ─── Analyzer ───────────────────────────────────────────────

export function analyzeLaravel(
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

  const composer = readJson(join(rootDir, "composer.json"));
  const composerRequire = { ...(composer?.require ?? {}), ...(composer?.["require-dev"] ?? {}) };
  const envExample = readSafe(join(rootDir, ".env.example"));

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "routes/web.php",
    "routes/api.php",
    "config/app.php",
    "app/Providers/AppServiceProvider.php",
    "bootstrap/app.php",
    "artisan",
    "public/index.php",
  ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "app/": "Application core (models, controllers, services)",
    "app/Http/Controllers/": "HTTP controllers (request handlers)",
    "app/Http/Middleware/": "HTTP middleware (auth, CORS, throttle, etc.)",
    "app/Http/Requests/": "Form request validation classes",
    "app/Models/": "Eloquent ORM models",
    "app/Providers/": "Service providers (boot + register bindings)",
    "app/Policies/": "Authorization policies (Gate)",
    "app/Events/": "Event classes",
    "app/Listeners/": "Event listeners",
    "app/Jobs/": "Queued job classes",
    "app/Mail/": "Mailable classes (email)",
    "app/Notifications/": "Notification classes (email, SMS, Slack)",
    "app/Console/": "Artisan commands + scheduled tasks (Kernel.php)",
    "app/Exceptions/": "Exception handlers",
    "app/Services/": "Service layer (business logic)",
    "app/Actions/": "Action classes (single-purpose operations)",
    "app/Enums/": "Backed enum classes (PHP 8.1+)",
    "config/": "Configuration files (app, database, mail, etc.)",
    "database/migrations/": "Database migration files (timestamped)",
    "database/seeders/": "Database seed classes",
    "database/factories/": "Eloquent model factories (testing)",
    "resources/views/": "Blade templates",
    "resources/css/": "CSS source files",
    "resources/js/": "JavaScript source files",
    "resources/lang/": "Language/translation files (i18n)",
    "routes/": "Route definitions (web, api, console, channels)",
    "storage/": "App storage (logs, cache, uploads) — DON'T commit",
    "storage/app/": "Application file storage",
    "storage/framework/": "Framework cache + sessions (auto-generated)",
    "storage/logs/": "Application log files",
    "public/": "Web root (index.php, compiled assets)",
    "tests/": "Test suite (Feature + Unit)",
    "tests/Feature/": "Feature / integration tests",
    "tests/Unit/": "Unit tests",
    "bootstrap/": "Framework bootstrap + cached config",
    "vendor/": "Composer dependencies (DON'T modify)",
    "lang/": "Translation files (Laravel 10+)",
    "stubs/": "Custom generator stubs",
  };

  // Livewire
  if (composerRequire["livewire/livewire"]) {
    enrichment.dirPurposes["app/Livewire/"] = "Livewire components (server-driven UI)";
    enrichment.dirPurposes["resources/views/livewire/"] = "Livewire Blade templates";
  }

  // Inertia
  if (composerRequire["inertiajs/inertia-laravel"]) {
    enrichment.dirPurposes["resources/js/Pages/"] = "Inertia page components (Vue/React)";
    enrichment.dirPurposes["resources/js/Components/"] = "Shared Inertia UI components";
    enrichment.dirPurposes["resources/js/Layouts/"] = "Inertia layout components";
  }

  // Nova
  if (composerRequire["laravel/nova"]) {
    enrichment.dirPurposes["app/Nova/"] = "Laravel Nova admin resources";
    enrichment.dirPurposes["nova-components/"] = "Custom Nova components";
  }

  // Filament
  if (composerRequire["filament/filament"]) {
    enrichment.dirPurposes["app/Filament/"] = "Filament admin panel resources";
    enrichment.dirPurposes["app/Filament/Resources/"] = "Filament CRUD resources";
    enrichment.dirPurposes["app/Filament/Pages/"] = "Filament custom pages";
    enrichment.dirPurposes["app/Filament/Widgets/"] = "Filament dashboard widgets";
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    { name: "livewire/livewire", pattern: "livewire", label: "Livewire (reactive server-driven UI)" },
    { name: "inertiajs/inertia-laravel", pattern: "inertia", label: "Inertia.js (SPA without an API)" },
    { name: "laravel/nova", pattern: "nova", label: "Laravel Nova (admin panel)" },
    { name: "filament/filament", pattern: "filament", label: "Filament (admin panel)" },
    { name: "laravel/sanctum", pattern: "sanctum", label: "Sanctum (API auth / SPA auth)" },
    { name: "laravel/passport", pattern: "passport", label: "Passport (OAuth2 API auth)" },
    { name: "laravel/breeze", pattern: "breeze", label: "Breeze (auth scaffolding)" },
    { name: "laravel/jetstream", pattern: "jetstream", label: "Jetstream (auth + teams)" },
    { name: "laravel/fortify", pattern: "fortify", label: "Fortify (auth backend)" },
    { name: "laravel/socialite", pattern: "socialite", label: "Socialite (OAuth / social login)" },
    { name: "laravel/horizon", pattern: "horizon", label: "Horizon (Redis queue dashboard)" },
    { name: "laravel/telescope", pattern: "telescope", label: "Telescope (debug assistant)" },
    { name: "laravel/pulse", pattern: "pulse", label: "Pulse (performance monitoring)" },
    { name: "laravel/cashier", pattern: "cashier", label: "Cashier (Stripe/Paddle billing)" },
    { name: "laravel/scout", pattern: "scout", label: "Scout (full-text search)" },
    { name: "laravel/sail", pattern: "sail", label: "Sail (Docker dev environment)" },
    { name: "laravel/reverb", pattern: "reverb", label: "Reverb (WebSocket server)" },
    { name: "laravel/pennant", pattern: "pennant", label: "Pennant (feature flags)" },
    { name: "spatie/laravel-permission", pattern: "spatie-permission", label: "Spatie Permissions (roles + perms)" },
    { name: "spatie/laravel-medialibrary", pattern: "spatie-media", label: "Spatie Media Library (file uploads)" },
    { name: "spatie/laravel-activitylog", pattern: "spatie-activity", label: "Spatie Activity Log (audit trail)" },
    { name: "spatie/laravel-data", pattern: "spatie-data", label: "Spatie Data (DTOs)" },
    { name: "spatie/laravel-query-builder", pattern: "spatie-query", label: "Spatie Query Builder (API filtering)" },
    { name: "barryvdh/laravel-debugbar", pattern: "debugbar", label: "Debugbar (dev profiling)" },
    { name: "barryvdh/laravel-ide-helper", pattern: "ide-helper", label: "IDE Helper (autocompletion)" },
    { name: "pestphp/pest", pattern: "pest", label: "Pest (testing framework)" },
    { name: "nunomaduro/larastan", pattern: "larastan", label: "Larastan (PHPStan for Laravel)" },
  ];

  for (const dep of depChecks) {
    if (composerRequire[dep.name]) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  // Livewire
  if (composerRequire["livewire/livewire"]) {
    enrichment.patterns.push({ check: "livewire/livewire in composer", label: "Livewire reactive components" });
  }

  // Inertia
  if (composerRequire["inertiajs/inertia-laravel"]) {
    enrichment.patterns.push({ check: "inertiajs in composer", label: "Inertia.js SPA architecture" });
  }

  // Service layer
  if (existsSync(join(rootDir, "app/Services"))) {
    enrichment.patterns.push({ check: "app/Services/ exists", label: "Service layer pattern" });
  }

  // Action classes
  if (existsSync(join(rootDir, "app/Actions"))) {
    enrichment.patterns.push({ check: "app/Actions/ exists", label: "Action classes (single-purpose)" });
  }

  // Repository pattern
  if (existsSync(join(rootDir, "app/Repositories"))) {
    enrichment.patterns.push({ check: "app/Repositories/ exists", label: "Repository pattern (data access)" });
  }

  // Events / Listeners
  if (existsSync(join(rootDir, "app/Events")) && existsSync(join(rootDir, "app/Listeners"))) {
    enrichment.patterns.push({ check: "Events + Listeners dirs", label: "Event-driven architecture" });
  }

  // Jobs (queue)
  if (existsSync(join(rootDir, "app/Jobs"))) {
    enrichment.patterns.push({ check: "app/Jobs/ exists", label: "Queued job processing" });
  }

  // API versioning
  if (existsSync(join(rootDir, "routes/api.php")) && existsSync(join(rootDir, "app/Http/Controllers/Api"))) {
    enrichment.patterns.push({ check: "Api controller namespace", label: "API controllers with versioning" });
  }

  // Form Requests
  if (existsSync(join(rootDir, "app/Http/Requests"))) {
    enrichment.patterns.push({ check: "FormRequest classes", label: "Form Request validation" });
  }

  // Policies
  if (existsSync(join(rootDir, "app/Policies"))) {
    enrichment.patterns.push({ check: "app/Policies/ exists", label: "Policy-based authorization" });
  }

  // Enums
  if (existsSync(join(rootDir, "app/Enums"))) {
    enrichment.patterns.push({ check: "app/Enums/ exists", label: "PHP 8.1+ backed enums" });
  }

  // Multi-tenancy
  if (composerRequire["stancl/tenancy"] || composerRequire["spatie/laravel-multitenancy"]) {
    enrichment.patterns.push({ check: "tenancy package", label: "Multi-tenant architecture" });
  }

  // Docker / Sail
  if (composerRequire["laravel/sail"] || existsSync(join(rootDir, "docker-compose.yml"))) {
    enrichment.patterns.push({ check: "Sail or docker-compose", label: "Docker development environment" });
  }

  // Filament
  if (composerRequire["filament/filament"]) {
    enrichment.patterns.push({ check: "filament/filament", label: "Filament admin panel" });
  }

  // ─── Commands ──────────────────────────────────────────────

  const artisan = composerRequire["laravel/sail"] ? "sail artisan" : "php artisan";
  const phpPrefix = composerRequire["laravel/sail"] ? "sail" : "php";

  enrichment.commands.push(
    { command: `${artisan} serve`, description: "Start Laravel dev server (port 8000)", category: "dev" },
    { command: `${artisan} test`, description: "Run test suite (PHPUnit/Pest)", category: "test" },
    { command: `${artisan} migrate`, description: "Run pending database migrations", category: "db" },
    { command: `${artisan} migrate:status`, description: "Show migration status", category: "db" },
    { command: `${artisan} migrate:rollback`, description: "Rollback last batch of migrations", category: "db" },
    { command: `${artisan} migrate:fresh --seed`, description: "Drop all tables, re-migrate, and seed", category: "db" },
    { command: `${artisan} db:seed`, description: "Run database seeders", category: "db" },
    { command: `${artisan} make:model ModelName -mfs`, description: "Generate model + migration + factory + seeder", category: "other" },
    { command: `${artisan} make:controller NameController --resource`, description: "Generate resource controller (CRUD)", category: "other" },
    { command: `${artisan} tinker`, description: "Interactive REPL (Eloquent, helpers)", category: "dev" },
    { command: `${artisan} route:list`, description: "List all registered routes", category: "other" },
    { command: `${artisan} config:clear`, description: "Clear cached config (after .env changes)", category: "other" },
    { command: `${artisan} cache:clear`, description: "Flush application cache", category: "other" },
    { command: `${artisan} queue:work`, description: "Start queue worker", category: "dev" },
    { command: "composer install", description: "Install PHP dependencies", category: "build" },
  );

  // Sail-specific
  if (composerRequire["laravel/sail"]) {
    enrichment.commands.push(
      { command: "./vendor/bin/sail up -d", description: "Start Sail Docker containers", category: "dev" },
      { command: "./vendor/bin/sail down", description: "Stop Sail Docker containers", category: "dev" },
      { command: "./vendor/bin/sail shell", description: "Open shell in app container", category: "dev" },
    );
  }

  // Horizon
  if (composerRequire["laravel/horizon"]) {
    enrichment.commands.push(
      { command: `${artisan} horizon`, description: "Start Horizon queue dashboard + workers", category: "dev" },
    );
  }

  // IDE Helper
  if (composerRequire["barryvdh/laravel-ide-helper"]) {
    enrichment.commands.push(
      { command: `${artisan} ide-helper:generate`, description: "Regenerate IDE helper file", category: "other" },
      { command: `${artisan} ide-helper:models --nowrite`, description: "Generate model PHPDocs", category: "other" },
    );
  }

  // Pest
  if (composerRequire["pestphp/pest"]) {
    enrichment.commands.push(
      { command: "./vendor/bin/pest", description: "Run Pest test suite", category: "test" },
      { command: "./vendor/bin/pest --parallel", description: "Run Pest tests in parallel", category: "test" },
    );
  }

  // Vite / Mix frontend
  const pkgJson = readJson(join(rootDir, "package.json"));
  if (pkgJson) {
    const scripts = pkgJson.scripts ?? {};
    if (scripts.dev) {
      enrichment.commands.push({ command: "npm run dev", description: "Start Vite dev server (frontend assets)", category: "dev" });
    }
    if (scripts.build) {
      enrichment.commands.push({ command: "npm run build", description: "Build frontend assets for production", category: "build" });
    }
  }

  // Static analysis
  if (composerRequire["nunomaduro/larastan"] || composerRequire["phpstan/phpstan"]) {
    enrichment.commands.push(
      { command: "./vendor/bin/phpstan analyse", description: "Run PHPStan/Larastan static analysis", category: "lint" },
    );
  }

  // Pint (Laravel code style)
  if (existsSync(join(rootDir, "pint.json")) || composerRequire["laravel/pint"]) {
    enrichment.commands.push(
      { command: "./vendor/bin/pint", description: "Format PHP code (Laravel Pint)", category: "lint" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  enrichment.database = {
    ormName: "Eloquent ORM",
    migrationDir: "database/migrations",
  };

  // Detect DB driver from .env.example
  if (envExample) {
    if (envExample.includes("DB_CONNECTION=pgsql") || envExample.includes("DB_CONNECTION=postgresql")) {
      enrichment.database.schemaFile = "config/database.php";
    } else if (envExample.includes("DB_CONNECTION=mysql")) {
      enrichment.database.schemaFile = "config/database.php";
    } else if (envExample.includes("DB_CONNECTION=sqlite")) {
      enrichment.database.schemaFile = "config/database.php";
    }
  }

  // ─── Testing ───────────────────────────────────────────────

  if (composerRequire["pestphp/pest"]) {
    enrichment.testing = {
      framework: "Pest",
      testDir: "tests",
      systemTestTools: [],
    };
  } else {
    enrichment.testing = {
      framework: "PHPUnit",
      testDir: "tests",
      systemTestTools: [],
    };
  }

  if (composerRequire["laravel/dusk"]) {
    enrichment.testing.systemTestTools!.push("Laravel Dusk (browser testing)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T edit migration files after they've been run",
      reason: "Create a new migration instead. Editing a run migration will cause schema mismatch. Use `php artisan migrate:fresh` only in development",
      severity: "critical",
    },
    {
      rule: "DON'T modify files in vendor/",
      reason: "Composer-managed dependencies. Edits are lost on next `composer install`. Fork the package or use service providers to override behavior",
      severity: "critical",
    },
    {
      rule: "DON'T modify files in storage/framework/",
      reason: "Auto-generated cache, sessions, and views. Use `artisan cache:clear` / `view:clear` commands instead",
      severity: "critical",
    },
    {
      rule: "DON'T put business logic in controllers",
      reason: "Extract to service classes, action classes, or model methods. Controllers should only handle HTTP concerns (request/response)",
      severity: "important",
    },
    {
      rule: "DON'T use raw SQL queries without bindings",
      reason: "Always use Eloquent or query builder parameterized queries. Raw string interpolation in SQL opens SQL injection vulnerabilities",
      severity: "critical",
    },
    {
      rule: "DON'T forget to clear config cache after .env changes",
      reason: "Run `php artisan config:clear` when changing .env values. Cached config ignores .env changes",
      severity: "important",
    },
    {
      rule: "DON'T add N+1 queries",
      reason: "Use `with()` for eager loading relationships. Install barryvdh/laravel-debugbar to detect N+1 queries in development",
      severity: "important",
    },
    {
      rule: "DON'T skip Form Request validation",
      reason: "Use FormRequest classes for all controller input validation. Don't validate manually in controller methods",
      severity: "important",
    },
    {
      rule: "DON'T use `$request->all()` for mass assignment",
      reason: "Use `$request->validated()` from FormRequest or `$request->only([...])` to prevent mass assignment vulnerabilities",
      severity: "critical",
    },
    {
      rule: "DON'T commit .env to version control",
      reason: ".env contains secrets (DB credentials, API keys). Use .env.example as template. Load secrets from your hosting platform in production",
      severity: "critical",
    },
    {
      rule: "ALWAYS use `$fillable` or `$guarded` on Eloquent models",
      reason: "Without mass assignment protection, attackers can set any model attribute via request input",
      severity: "critical",
    },
  );

  // Livewire-specific gotchas
  if (composerRequire["livewire/livewire"]) {
    enrichment.gotchas.push(
      {
        rule: "DON'T store sensitive data in Livewire public properties",
        reason: "Livewire public properties are visible in the browser DOM. Use computed properties or database queries for sensitive data",
        severity: "critical",
      },
      {
        rule: "DON'T forget `wire:key` on Livewire loops",
        reason: "Without wire:key, Livewire can't track DOM elements correctly during list updates, causing rendering bugs",
        severity: "important",
      },
    );
  }

  // Inertia-specific gotchas
  if (composerRequire["inertiajs/inertia-laravel"]) {
    enrichment.gotchas.push({
      rule: "DON'T pass Eloquent models directly to Inertia",
      reason: "Use API Resources or `->only()` to control serialized data. Passing models directly may expose hidden attributes or relationships",
      severity: "important",
    });
  }

  return enrichment;
}
