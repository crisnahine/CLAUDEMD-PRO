/**
 * Phoenix / Elixir Deep Analyzer
 *
 * Detects Ecto schemas/changesets, LiveView, contexts, channels,
 * PubSub, Oban job processing, ExUnit, Credo, endpoint configuration,
 * and Elixir-specific architectural patterns.
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

function findAppName(rootDir: string): string | null {
  const mixExs = readSafe(join(rootDir, "mix.exs"));
  if (!mixExs) return null;

  // Extract app name from mix.exs: app: :my_app
  const appMatch = mixExs.match(/app:\s*:(\w+)/);
  return appMatch?.[1] ?? null;
}

function findWebModule(rootDir: string, appName: string): string | null {
  // Phoenix convention: lib/<app>_web/
  const webDir = `lib/${appName}_web`;
  if (existsSync(join(rootDir, webDir))) return webDir;
  return null;
}

// ─── Analyzer ───────────────────────────────────────────────

export function analyzePhoenix(
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

  const mixExs = readSafe(join(rootDir, "mix.exs")) ?? "";
  const appName = findAppName(rootDir);
  const webModule = appName ? findWebModule(rootDir, appName) : null;

  // Config files
  const configExs = readSafe(join(rootDir, "config/config.exs")) ?? "";
  const devExs = readSafe(join(rootDir, "config/dev.exs")) ?? "";
  const prodExs = readSafe(join(rootDir, "config/prod.exs")) ?? "";
  const runtimeExs = readSafe(join(rootDir, "config/runtime.exs")) ?? "";
  const allConfig = `${configExs}\n${devExs}\n${prodExs}\n${runtimeExs}`;

  // ─── Entry Points ──────────────────────────────────────────

  enrichment.entryPoints.push("mix.exs");

  if (existsSync(join(rootDir, "config/config.exs"))) {
    enrichment.entryPoints.push("config/config.exs");
  }
  if (existsSync(join(rootDir, "config/runtime.exs"))) {
    enrichment.entryPoints.push("config/runtime.exs");
  }

  if (webModule) {
    // Look for endpoint.ex and router.ex
    const endpointPath = `${webModule}/endpoint.ex`;
    const routerPath = `${webModule}/router.ex`;
    if (existsSync(join(rootDir, endpointPath))) enrichment.entryPoints.push(endpointPath);
    if (existsSync(join(rootDir, routerPath))) enrichment.entryPoints.push(routerPath);
  }

  if (appName && existsSync(join(rootDir, `lib/${appName}/application.ex`))) {
    enrichment.entryPoints.push(`lib/${appName}/application.ex`);
  }

  // ─── Directory Purposes ────────────────────────────────────

  if (appName) {
    enrichment.dirPurposes[`lib/${appName}/`] = "Core business logic (contexts, schemas, domain)";
    if (webModule) {
      enrichment.dirPurposes[`${webModule}/`] = "Phoenix web layer (controllers, views, templates, channels)";
      enrichment.dirPurposes[`${webModule}/controllers/`] = "Phoenix controllers (request handlers)";
      enrichment.dirPurposes[`${webModule}/live/`] = "LiveView modules (real-time server-rendered UI)";
      enrichment.dirPurposes[`${webModule}/components/`] = "Phoenix function components + LiveComponents";
      enrichment.dirPurposes[`${webModule}/templates/`] = "HEEx templates (if not colocated)";
      enrichment.dirPurposes[`${webModule}/channels/`] = "Phoenix Channels (WebSocket handlers)";
      enrichment.dirPurposes[`${webModule}/plugs/`] = "Custom Plug middleware";
    }
  }

  enrichment.dirPurposes = {
    ...enrichment.dirPurposes,
    "config/": "Environment-specific config (config.exs, dev.exs, prod.exs, runtime.exs)",
    "priv/repo/migrations/": "Ecto database migration files",
    "priv/repo/seeds.exs": "Database seed script",
    "priv/static/": "Static assets served by Phoenix (DON'T edit generated files)",
    "priv/gettext/": "i18n translation files (Gettext)",
    "assets/": "Frontend build source (JS, CSS) — compiled to priv/static/",
    "test/": "ExUnit test suite",
    "test/support/": "Test helpers, fixtures, factories",
    "rel/": "Release configuration (mix release)",
  };

  // Detect contexts (Phoenix 1.3+ pattern: lib/app/accounts.ex, lib/app/accounts/)
  if (appName) {
    const libApp = join(rootDir, `lib/${appName}`);
    if (existsSync(libApp)) {
      try {
        const entries = readdirSync(libApp, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "application.ex") {
            enrichment.dirPurposes[`lib/${appName}/${entry.name}/`] = `${capitalize(entry.name)} context (domain boundary)`;
          }
        }
      } catch { /* permission denied */ }
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    { name: "phoenix", pattern: ":phoenix", label: "Phoenix (web framework)" },
    { name: "phoenix_live_view", pattern: ":phoenix_live_view", label: "Phoenix LiveView (real-time UI)" },
    { name: "phoenix_live_dashboard", pattern: ":phoenix_live_dashboard", label: "LiveDashboard (metrics UI)" },
    { name: "ecto_sql", pattern: ":ecto_sql", label: "Ecto SQL (database layer)" },
    { name: "postgrex", pattern: ":postgrex", label: "Postgrex (PostgreSQL driver)" },
    { name: "myxql", pattern: ":myxql", label: "MyXQL (MySQL driver)" },
    { name: "oban", pattern: ":oban", label: "Oban (background job processing)" },
    { name: "oban_web", pattern: ":oban_web", label: "Oban Web (job dashboard)" },
    { name: "absinthe", pattern: ":absinthe", label: "Absinthe (GraphQL)" },
    { name: "absinthe_plug", pattern: ":absinthe_plug", label: "Absinthe Plug (GraphQL HTTP)" },
    { name: "guardian", pattern: ":guardian", label: "Guardian (JWT authentication)" },
    { name: "pow", pattern: ":pow", label: "Pow (authentication)" },
    { name: "ueberauth", pattern: ":ueberauth", label: "Ueberauth (OAuth / social auth)" },
    { name: "swoosh", pattern: ":swoosh", label: "Swoosh (email library)" },
    { name: "bamboo", pattern: ":bamboo", label: "Bamboo (email library)" },
    { name: "tesla", pattern: ":tesla", label: "Tesla (HTTP client)" },
    { name: "finch", pattern: ":finch", label: "Finch (HTTP client)" },
    { name: "req", pattern: ":req", label: "Req (HTTP client)" },
    { name: "jason", pattern: ":jason", label: "Jason (JSON encoder/decoder)" },
    { name: "ex_machina", pattern: ":ex_machina", label: "ExMachina (test factories)" },
    { name: "credo", pattern: ":credo", label: "Credo (static code analysis)" },
    { name: "dialyxir", pattern: ":dialyxir", label: "Dialyxir (type specs analysis)" },
    { name: "sobelow", pattern: ":sobelow", label: "Sobelow (security analysis)" },
    { name: "floki", pattern: ":floki", label: "Floki (HTML parser)" },
    { name: "gettext", pattern: ":gettext", label: "Gettext (i18n translations)" },
    { name: "tailwind", pattern: ":tailwind", label: "Tailwind CSS" },
    { name: "esbuild", pattern: ":esbuild", label: "esbuild (JS bundler)" },
    { name: "bandit", pattern: ":bandit", label: "Bandit (HTTP server)" },
    { name: "plug_cowboy", pattern: ":plug_cowboy", label: "Cowboy (HTTP server)" },
    { name: "phoenix_pubsub_redis", pattern: ":phoenix_pubsub_redis", label: "PubSub Redis adapter (multi-node)" },
    { name: "libcluster", pattern: ":libcluster", label: "libcluster (node clustering)" },
    { name: "nebulex", pattern: ":nebulex", label: "Nebulex (distributed caching)" },
    { name: "commanded", pattern: ":commanded", label: "Commanded (CQRS/Event Sourcing)" },
    { name: "ash", pattern: ":ash", label: "Ash Framework (declarative domain modeling)" },
  ];

  for (const dep of depChecks) {
    if (mixExs.includes(dep.pattern)) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  if (mixExs.includes(":phoenix_live_view")) {
    enrichment.patterns.push({ check: "phoenix_live_view in deps", label: "Phoenix LiveView (server-rendered real-time UI)" });
  }

  if (mixExs.includes(":oban")) {
    enrichment.patterns.push({ check: "oban in deps", label: "Oban background job processing" });
  }

  if (mixExs.includes(":absinthe")) {
    enrichment.patterns.push({ check: "absinthe in deps", label: "GraphQL API (Absinthe)" });
  }

  if (mixExs.includes(":commanded")) {
    enrichment.patterns.push({ check: "commanded in deps", label: "CQRS / Event Sourcing (Commanded)" });
  }

  if (mixExs.includes(":ash")) {
    enrichment.patterns.push({ check: "ash in deps", label: "Ash Framework (declarative resources)" });
  }

  // Context-based architecture
  if (appName && existsSync(join(rootDir, `lib/${appName}`))) {
    try {
      const entries = readdirSync(join(rootDir, `lib/${appName}`), { withFileTypes: true });
      const contexts = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));
      if (contexts.length >= 2) {
        enrichment.patterns.push({ check: "multiple context dirs", label: "Phoenix Contexts (bounded domain modules)" });
      }
    } catch { /* permission denied */ }
  }

  // PubSub
  if (allConfig.includes("PubSub") || allConfig.includes("pubsub")) {
    enrichment.patterns.push({ check: "PubSub in config", label: "Phoenix PubSub (distributed messaging)" });
  }

  // Channels
  if (webModule && existsSync(join(rootDir, `${webModule}/channels`))) {
    enrichment.patterns.push({ check: "channels/ directory", label: "Phoenix Channels (WebSocket communication)" });
  }

  // Umbrella project
  if (existsSync(join(rootDir, "apps"))) {
    enrichment.patterns.push({ check: "apps/ directory", label: "Umbrella project (multi-app)" });
  }

  // Releases
  if (existsSync(join(rootDir, "rel"))) {
    enrichment.patterns.push({ check: "rel/ directory", label: "Mix releases (production deployment)" });
  }

  // Clustering
  if (mixExs.includes(":libcluster")) {
    enrichment.patterns.push({ check: "libcluster in deps", label: "Node clustering (distributed Elixir)" });
  }

  // Telemetry
  if (mixExs.includes(":telemetry") || allConfig.includes("telemetry")) {
    enrichment.patterns.push({ check: "telemetry in deps/config", label: "Telemetry-based observability" });
  }

  // ─── Commands ──────────────────────────────────────────────

  enrichment.commands.push(
    { command: "mix phx.server", description: "Start Phoenix dev server (port 4000)", category: "dev" },
    { command: "iex -S mix phx.server", description: "Start dev server with interactive Elixir shell", category: "dev" },
    { command: "mix test", description: "Run ExUnit test suite", category: "test" },
    { command: "mix test --cover", description: "Run tests with coverage report", category: "test" },
    { command: "mix test --stale", description: "Run only tests affected by code changes", category: "test" },
    { command: "mix ecto.create", description: "Create database", category: "db" },
    { command: "mix ecto.migrate", description: "Run pending Ecto migrations", category: "db" },
    { command: "mix ecto.rollback", description: "Rollback last migration", category: "db" },
    { command: "mix ecto.reset", description: "Drop, create, migrate, and seed database", category: "db" },
    { command: "mix ecto.gen.migration name", description: "Generate new migration file", category: "db" },
    { command: "mix deps.get", description: "Install Hex dependencies", category: "build" },
    { command: "mix compile", description: "Compile Elixir source", category: "build" },
    { command: "mix phx.routes", description: "List all routes", category: "other" },
    { command: "mix phx.gen.html Context Schema table fields...", description: "Generate HTML CRUD scaffold", category: "other" },
    { command: "mix phx.gen.live Context Schema table fields...", description: "Generate LiveView CRUD scaffold", category: "other" },
    { command: "mix phx.gen.context Context Schema table fields...", description: "Generate context + schema (no web layer)", category: "other" },
  );

  // Credo
  if (mixExs.includes(":credo")) {
    enrichment.commands.push(
      { command: "mix credo", description: "Run Credo static analysis", category: "lint" },
      { command: "mix credo --strict", description: "Run Credo in strict mode", category: "lint" },
    );
  }

  // Dialyxir
  if (mixExs.includes(":dialyxir")) {
    enrichment.commands.push(
      { command: "mix dialyzer", description: "Run Dialyzer type analysis", category: "lint" },
    );
  }

  // Sobelow
  if (mixExs.includes(":sobelow")) {
    enrichment.commands.push(
      { command: "mix sobelow", description: "Run Sobelow security analysis", category: "lint" },
    );
  }

  // Release
  enrichment.commands.push(
    { command: "mix release", description: "Build production release", category: "deploy" },
  );

  // Seeds
  if (existsSync(join(rootDir, "priv/repo/seeds.exs"))) {
    enrichment.commands.push(
      { command: "mix run priv/repo/seeds.exs", description: "Run database seeds", category: "db" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  if (mixExs.includes(":ecto_sql") || mixExs.includes(":ecto")) {
    enrichment.database = {
      ormName: "Ecto",
      migrationDir: "priv/repo/migrations",
    };
  }

  // ─── Testing ───────────────────────────────────────────────

  enrichment.testing = {
    framework: "ExUnit",
    testDir: "test",
    systemTestTools: [],
  };

  if (mixExs.includes(":ex_machina")) enrichment.testing.systemTestTools!.push("ExMachina (test factories)");
  if (mixExs.includes(":mox")) enrichment.testing.systemTestTools!.push("Mox (mock library)");
  if (mixExs.includes(":bypass")) enrichment.testing.systemTestTools!.push("Bypass (HTTP mock server)");
  if (mixExs.includes(":wallaby")) enrichment.testing.systemTestTools!.push("Wallaby (browser testing)");
  if (mixExs.includes(":floki")) enrichment.testing.systemTestTools!.push("Floki (HTML assertion helper)");
  if (mixExs.includes(":phoenix_live_view")) enrichment.testing.systemTestTools!.push("LiveView test helpers");

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T edit Ecto migration files after they've been run",
      reason: "Ecto tracks migrations by timestamp. Editing a run migration causes checksum errors. Create a new migration to fix issues",
      severity: "critical",
    },
    {
      rule: "DON'T modify files in priv/static/ that come from assets/",
      reason: "priv/static/ contains compiled output from the assets pipeline (esbuild/Tailwind). Edit source files in assets/ instead",
      severity: "critical",
    },
    {
      rule: "DON'T use Repo directly in controllers or LiveView modules",
      reason: "Always go through context functions (e.g., Accounts.get_user/1). Contexts are the API boundary for domain logic",
      severity: "important",
    },
    {
      rule: "DON'T bypass Ecto changesets for data mutation",
      reason: "Always use changesets for inserts/updates. They validate data, cast types, and track changes. Direct SQL bypasses all validations",
      severity: "critical",
    },
    {
      rule: "DON'T forget to handle changeset errors in LiveView forms",
      reason: "Assign the failed changeset back to the socket: `{:noreply, assign(socket, :changeset, changeset)}`. Don't silently swallow errors",
      severity: "important",
    },
    {
      rule: "DON'T store large data in LiveView assigns",
      reason: "LiveView assigns are stored in memory per connected client. Large assigns (lists, binary data) cause memory bloat. Use streams or temporary assigns",
      severity: "important",
    },
    {
      rule: "DON'T use `String.to_atom/1` on user input",
      reason: "Atoms are never garbage collected. Converting user input to atoms leads to atom table exhaustion and VM crash. Use `String.to_existing_atom/1` or keep as strings",
      severity: "critical",
    },
    {
      rule: "DON'T forget to preload associations before accessing them",
      reason: "Ecto associations are not lazy-loaded. Accessing an unloaded association raises `Ecto.Association.NotLoaded`. Use `Repo.preload/2` or join queries",
      severity: "critical",
    },
    {
      rule: "ALWAYS use `runtime.exs` for production secrets, not `config.exs`",
      reason: "config.exs is evaluated at compile time (build time). runtime.exs is evaluated at boot — use it for environment variables and secrets in releases",
      severity: "critical",
    },
    {
      rule: "DON'T spawn raw processes for background work",
      reason: "Use Task.Supervisor, Oban, or GenServer. Unsupervised processes crash silently and aren't restarted. The OTP supervision tree exists for a reason",
      severity: "important",
    },
  );

  // LiveView-specific
  if (mixExs.includes(":phoenix_live_view")) {
    enrichment.gotchas.push(
      {
        rule: "DON'T use `redirect/2` inside LiveView `handle_event` callbacks",
        reason: "Use `push_navigate/2` or `push_patch/2` for LiveView navigation. `redirect/2` does a full page reload which defeats the purpose of LiveView",
        severity: "important",
      },
      {
        rule: "DON'T forget to handle the `mount/3` params for both connected and disconnected states",
        reason: "LiveView `mount` is called twice: once on initial HTTP request (disconnected) and once on WebSocket connect. Both calls must set up assigns",
        severity: "important",
      },
    );
  }

  // Oban-specific
  if (mixExs.includes(":oban")) {
    enrichment.gotchas.push({
      rule: "DON'T pass non-serializable data to Oban job args",
      reason: "Oban args are stored as JSON in the database. Only use strings, numbers, booleans, lists, and maps. No structs, tuples, or PIDs",
      severity: "important",
    });
  }

  return enrichment;
}

// ─── Utilities ──────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
