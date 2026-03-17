/**
 * Deno (Fresh / Oak / Hono on Deno) Deep Analyzer
 *
 * Detects Deno-specific patterns, Fresh framework, Oak middleware,
 * Deno KV, permission flags, and common gotchas.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { FrameworkEnrichment } from "./go.js";

export type { FrameworkEnrichment };

// ─── Helpers ────────────────────────────────────────────────

function readSafe(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : null;
  } catch {
    return null;
  }
}

// ─── Analyzer ───────────────────────────────────────────────

export function analyzeDeno(
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

  // Read deno.json or deno.jsonc
  const denoJsonRaw = readSafe(join(rootDir, "deno.json")) ?? readSafe(join(rootDir, "deno.jsonc")) ?? "";
  let denoConfig: Record<string, unknown> = {};
  try {
    // Strip JSONC comments for parsing
    const stripped = denoJsonRaw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (stripped.trim()) {
      denoConfig = JSON.parse(stripped);
    }
  } catch { /* invalid JSON */ }

  const imports: Record<string, string> = (denoConfig.imports as Record<string, string>) ?? {};
  const tasks: Record<string, string> = (denoConfig.tasks as Record<string, string>) ?? {};

  const allImportsStr = Object.keys(imports).join("\n") + "\n" + Object.values(imports).join("\n");

  const hasDep = (pattern: string): boolean => {
    return allImportsStr.includes(pattern) || !!keyDeps[pattern];
  };

  // Detect frameworks
  const isFresh = hasDep("fresh") || existsSync(join(rootDir, "fresh.config.ts")) || existsSync(join(rootDir, "fresh.gen.ts"));
  const isOak = hasDep("oak");
  const isHono = hasDep("hono");

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "main.ts",
    "main.tsx",
    "mod.ts",
    "deno.json",
    "deno.jsonc",
    "fresh.config.ts",
    "dev.ts",
    "src/main.ts",
    "src/server.ts",
    "import_map.json",
  ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "src/": "Application source code",
  };

  if (isFresh) {
    enrichment.dirPurposes = {
      ...enrichment.dirPurposes,
      "routes/": "File-based routing (Fresh) — each file becomes a route",
      "routes/api/": "API route handlers (Fresh)",
      "islands/": "Interactive island components (hydrated on client)",
      "components/": "Server-rendered Preact components (no client JS)",
      "static/": "Static assets served directly",
      "signals/": "Shared reactive signals (Preact Signals)",
      "utils/": "Utility functions and helpers",
    };
  }

  if (isOak || isHono) {
    const apiDirs: Record<string, string> = {
      "src/routes/": "Route definitions and handlers",
      "src/middleware/": "Custom middleware functions",
      "src/controllers/": "Request handler logic",
      "src/services/": "Business logic and service layer",
      "src/models/": "Data models and type definitions",
    };
    for (const [dir, purpose] of Object.entries(apiDirs)) {
      if (existsSync(join(rootDir, dir))) {
        enrichment.dirPurposes[dir] = purpose;
      }
    }
  }

  const conditionalDirs: Record<string, string> = {
    "lib/": "Library code and shared modules",
    "utils/": "Utility functions and helpers",
    "types/": "TypeScript type definitions",
    "db/": "Database connection and queries",
    "tests/": "Test files",
    "scripts/": "Build and utility scripts",
    "plugins/": "Framework plugins and extensions",
  };

  for (const [dir, purpose] of Object.entries(conditionalDirs)) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[dir] = purpose;
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Frameworks
    { name: "fresh", pattern: "fresh", label: "Fresh (Deno full-stack framework)" },
    { name: "oak", pattern: "oak", label: "Oak (middleware framework for Deno)" },
    { name: "hono", pattern: "hono", label: "Hono (edge-first web framework)" },
    // Std library
    { name: "std/http", pattern: "std/http", label: "Deno std/http (HTTP server utilities)" },
    { name: "std/path", pattern: "std/path", label: "Deno std/path (path utilities)" },
    { name: "std/fs", pattern: "std/fs", label: "Deno std/fs (file system utilities)" },
    { name: "std/testing", pattern: "std/testing", label: "Deno std/testing (test utilities)" },
    { name: "std/assert", pattern: "std/assert", label: "Deno std/assert (assertion library)" },
    { name: "std/dotenv", pattern: "std/dotenv", label: "Deno std/dotenv (environment variables)" },
    { name: "std/log", pattern: "std/log", label: "Deno std/log (logging)" },
    { name: "std/crypto", pattern: "std/crypto", label: "Deno std/crypto (cryptographic operations)" },
    // Database
    { name: "deno-postgres", pattern: "deno-postgres", label: "deno-postgres (PostgreSQL driver)" },
    { name: "postgres", pattern: "postgres", label: "PostgreSQL driver" },
    { name: "drizzle-orm", pattern: "drizzle-orm", label: "Drizzle ORM" },
    { name: "kysely", pattern: "kysely", label: "Kysely (type-safe SQL query builder)" },
    { name: "denodb", pattern: "denodb", label: "DenoDB (Deno ORM)" },
    { name: "mongo", pattern: "mongo", label: "Deno MongoDB driver" },
    // Validation
    { name: "zod", pattern: "zod", label: "Zod (schema validation)" },
    { name: "superstruct", pattern: "superstruct", label: "Superstruct (data validation)" },
    // Auth
    { name: "djwt", pattern: "djwt", label: "djwt (JWT for Deno)" },
    { name: "oauth2_client", pattern: "oauth2_client", label: "OAuth2 client for Deno" },
    // CORS
    { name: "cors", pattern: "cors", label: "CORS middleware" },
    // Preact (for Fresh)
    { name: "preact", pattern: "preact", label: "Preact (lightweight React alternative)" },
    { name: "preact-signals", pattern: "preact/signals", label: "Preact Signals (reactive state)" },
    // Other
    { name: "cliffy", pattern: "cliffy", label: "Cliffy (CLI framework for Deno)" },
    { name: "redis", pattern: "redis", label: "Redis client for Deno" },
  ];

  for (const dep of depChecks) {
    if (hasDep(dep.pattern)) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  enrichment.patterns.push({ check: "Deno runtime", label: "Deno runtime (secure by default, TypeScript native)" });

  if (isFresh) {
    enrichment.patterns.push({ check: "Fresh detected", label: "Fresh framework (islands architecture)" });
    enrichment.patterns.push({ check: "Islands architecture", label: "Islands architecture (server-rendered with selective hydration)" });
  }

  if (isOak) {
    enrichment.patterns.push({ check: "Oak detected", label: "Oak middleware framework (Koa-style)" });
  }

  if (isHono) {
    enrichment.patterns.push({ check: "Hono on Deno", label: "Hono web framework on Deno" });
  }

  if (hasDep("zod")) {
    enrichment.patterns.push({ check: "Zod detected", label: "Zod schema validation" });
  }

  // Deno KV detection
  const mainContent = readSafe(join(rootDir, "main.ts")) ?? readSafe(join(rootDir, "src/main.ts")) ?? "";
  if (mainContent.includes("Deno.openKv") || mainContent.includes("Deno.kv")) {
    enrichment.patterns.push({ check: "Deno KV", label: "Deno KV (built-in key-value store)" });
  }

  // Permission model
  enrichment.patterns.push({ check: "Permission model", label: "Deno permission model (--allow-net, --allow-read, --allow-write)" });

  // Deno Deploy
  if (existsSync(join(rootDir, ".github/workflows")) || hasDep("fresh")) {
    enrichment.patterns.push({ check: "Deno Deploy potential", label: "Deno Deploy compatible (serverless edge)" });
  }

  if (existsSync(join(rootDir, "deno.lock"))) {
    enrichment.patterns.push({ check: "Lock file", label: "Dependency lock file (deno.lock)" });
  }

  const hasCompilerOptions = denoConfig.compilerOptions !== undefined;
  if (hasCompilerOptions) {
    enrichment.patterns.push({ check: "TypeScript config", label: "Custom TypeScript compiler options in deno.json" });
  }

  // ─── Commands ──────────────────────────────────────────────

  // Add task-based commands from deno.json
  if (tasks["dev"]) {
    enrichment.commands.push({ command: "deno task dev", description: "Start development server", category: "dev" });
  }
  if (tasks["start"]) {
    enrichment.commands.push({ command: "deno task start", description: "Start the application", category: "dev" });
  }
  if (tasks["build"]) {
    enrichment.commands.push({ command: "deno task build", description: "Build for production", category: "build" });
  }
  if (tasks["preview"]) {
    enrichment.commands.push({ command: "deno task preview", description: "Preview production build", category: "dev" });
  }

  // Default commands if no tasks
  if (!tasks["dev"] && !tasks["start"]) {
    if (isFresh) {
      enrichment.commands.push(
        { command: "deno task start", description: "Start Fresh development server", category: "dev" },
      );
    } else {
      enrichment.commands.push(
        { command: "deno run --allow-net main.ts", description: "Run the application", category: "dev" },
      );
    }
  }

  enrichment.commands.push(
    { command: "deno test", description: "Run all tests", category: "test" },
    { command: "deno test --coverage", description: "Run tests with code coverage", category: "test" },
    { command: "deno lint", description: "Run Deno linter", category: "lint" },
    { command: "deno fmt", description: "Format code with Deno formatter", category: "lint" },
    { command: "deno check **/*.ts", description: "Type-check TypeScript files", category: "lint" },
    { command: "deno cache main.ts", description: "Cache and type-check dependencies", category: "build" },
  );

  // Compile to binary
  enrichment.commands.push(
    { command: "deno compile --allow-net main.ts", description: "Compile to standalone binary", category: "build" },
  );

  // Deno Deploy
  if (isFresh) {
    enrichment.commands.push(
      { command: "deployctl deploy --project=<name> main.ts", description: "Deploy to Deno Deploy", category: "deploy" },
    );
  }

  // Docker
  if (existsSync(join(rootDir, "Dockerfile")) || existsSync(join(rootDir, "docker-compose.yml"))) {
    enrichment.commands.push(
      { command: "docker compose up -d", description: "Start infrastructure services", category: "dev" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  if (mainContent.includes("Deno.openKv") || mainContent.includes("Deno.kv")) {
    enrichment.database = { ormName: "Deno KV (built-in key-value store)" };
  } else if (hasDep("drizzle-orm")) {
    enrichment.database = { ormName: "Drizzle ORM" };
  } else if (hasDep("kysely")) {
    enrichment.database = { ormName: "Kysely" };
  } else if (hasDep("deno-postgres") || hasDep("postgres")) {
    enrichment.database = { ormName: "deno-postgres (raw SQL)" };
  } else if (hasDep("denodb")) {
    enrichment.database = { ormName: "DenoDB" };
  } else if (hasDep("mongo")) {
    enrichment.database = { ormName: "MongoDB (Deno driver)" };
  }

  // ─── Testing ───────────────────────────────────────────────

  enrichment.testing = {
    framework: "Deno.test (built-in)",
    testDir: "tests/ or **/*_test.ts (colocated)",
    systemTestTools: [],
  };

  if (hasDep("std/testing")) {
    enrichment.testing.systemTestTools!.push("std/testing (BDD, snapshot, mock utilities)");
  }
  if (hasDep("std/assert")) {
    enrichment.testing.systemTestTools!.push("std/assert (assertion functions)");
  }
  if (isFresh) {
    enrichment.testing.systemTestTools!.push("Fresh test utilities (route handler testing)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T use npm: prefix without verifying Deno compatibility",
      reason: "Not all npm packages work in Deno. Node.js built-in modules (fs, path, crypto) behave differently. Test npm: imports thoroughly and prefer Deno-native alternatives from deno.land/std or JSR",
      severity: "important",
    },
    {
      rule: "DON'T use __dirname or __filename — use import.meta",
      reason: "Deno uses ES modules natively. __dirname/__filename are Node.js CommonJS globals. Use import.meta.url and new URL('.', import.meta.url) for file paths",
      severity: "critical",
    },
    {
      rule: "DON'T forget --allow-* permission flags when running scripts",
      reason: "Deno is secure by default. Without explicit --allow-net, --allow-read, --allow-write, --allow-env flags, the runtime will deny access and throw a PermissionDenied error",
      severity: "critical",
    },
    {
      rule: "ALWAYS use deno.lock for reproducible builds",
      reason: "Without a lock file, dependency versions can drift between environments. Run `deno cache --lock=deno.lock` or enable lock in deno.json to pin dependency integrity hashes",
      severity: "important",
    },
    {
      rule: "DON'T mix npm: and https://deno.land/ imports for the same package",
      reason: "Mixing import sources for the same library causes duplicate modules in memory, type mismatches, and increased bundle size. Pick one source and use an import map for consistency",
      severity: "important",
    },
    {
      rule: "DON'T use require() — Deno is ESM only",
      reason: "Deno does not support CommonJS require(). All imports must use ES module import syntax. Use import maps in deno.json to create short aliases for long URLs",
      severity: "critical",
    },
    {
      rule: "DON'T import from raw GitHub URLs — use deno.land/x or JSR",
      reason: "Raw GitHub URLs are not versioned and can change. Use deno.land/x (pinned versions) or JSR (Deno's package registry) for reliable, cacheable, and auditable imports",
      severity: "important",
    },
    {
      rule: "DON'T forget to handle Deno.errors in file/network operations",
      reason: "Deno uses specific error classes (Deno.errors.NotFound, Deno.errors.PermissionDenied). Catching generic Error misses important context. Handle specific Deno errors for better diagnostics",
      severity: "nice-to-have",
    },
  );

  return enrichment;
}
