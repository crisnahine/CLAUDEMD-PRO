/**
 * Bun Native Deep Analyzer
 *
 * Detects Bun-specific patterns, Elysia framework, Bun.serve,
 * bun:test, bun:sqlite, and common gotchas.
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

export function analyzeBun(
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

  const pkgJson = readSafe(join(rootDir, "package.json"));
  const allDeps = pkgJson ? JSON.parse(pkgJson) : {};
  const deps: Record<string, string> = {
    ...(allDeps.dependencies ?? {}),
    ...(allDeps.devDependencies ?? {}),
  };

  const hasDep = (name: string): boolean => !!deps[name] || !!keyDeps[name];

  // Read bunfig.toml if present
  const bunfigToml = readSafe(join(rootDir, "bunfig.toml"));
  const hasBunLockb = existsSync(join(rootDir, "bun.lockb"));
  const hasBunLock = existsSync(join(rootDir, "bun.lock"));

  // Detect framework
  const isElysia = hasDep("elysia") || hasDep("@elysiajs/core");
  const isHono = hasDep("hono");

  // Read main entry to detect Bun.serve usage
  const mainEntry = readSafe(join(rootDir, "src/index.ts")) ?? readSafe(join(rootDir, "index.ts")) ?? readSafe(join(rootDir, "src/server.ts")) ?? "";
  const usesBunServe = mainEntry.includes("Bun.serve");

  // Package.json scripts
  const scripts: Record<string, string> = allDeps.scripts ?? {};

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "src/index.ts",
    "src/index.tsx",
    "index.ts",
    "index.tsx",
    "src/server.ts",
    "src/app.ts",
    "bunfig.toml",
    "package.json",
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

  const conditionalDirs: Record<string, string> = {
    "src/routes/": "Route handlers and endpoint definitions",
    "src/controllers/": "Request handler logic (controllers)",
    "src/services/": "Business logic and service layer",
    "src/models/": "Data models and type definitions",
    "src/plugins/": "Elysia/framework plugins and extensions",
    "src/middleware/": "Request/response middleware",
    "src/db/": "Database connection and queries",
    "src/schema/": "Database schema definitions",
    "src/types/": "TypeScript type definitions",
    "src/utils/": "Utility functions and helpers",
    "src/lib/": "Library code and shared modules",
    "src/config/": "Configuration and environment setup",
    "src/auth/": "Authentication and authorization logic",
    "src/validators/": "Request validation schemas",
    "tests/": "Test files",
    "test/": "Test files",
    "public/": "Static files served directly",
    "scripts/": "Build and utility scripts",
    "drizzle/": "Drizzle ORM migration files",
    "prisma/": "Prisma schema and migrations",
  };

  for (const [dir, purpose] of Object.entries(conditionalDirs)) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[dir] = purpose;
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Frameworks
    { name: "elysia", pattern: "elysia", label: "Elysia (ergonomic Bun web framework)" },
    { name: "hono", pattern: "hono", label: "Hono (edge-first web framework)" },
    // Elysia plugins
    { name: "@elysiajs/swagger", pattern: "@elysiajs/swagger", label: "Elysia Swagger/OpenAPI plugin" },
    { name: "@elysiajs/cors", pattern: "@elysiajs/cors", label: "Elysia CORS plugin" },
    { name: "@elysiajs/jwt", pattern: "@elysiajs/jwt", label: "Elysia JWT authentication plugin" },
    { name: "@elysiajs/bearer", pattern: "@elysiajs/bearer", label: "Elysia Bearer token plugin" },
    { name: "@elysiajs/cookie", pattern: "@elysiajs/cookie", label: "Elysia Cookie plugin" },
    { name: "@elysiajs/html", pattern: "@elysiajs/html", label: "Elysia HTML plugin" },
    { name: "@elysiajs/static", pattern: "@elysiajs/static", label: "Elysia static file serving plugin" },
    { name: "@elysiajs/eden", pattern: "@elysiajs/eden", label: "Elysia Eden (end-to-end type-safe client)" },
    { name: "@elysiajs/trpc", pattern: "@elysiajs/trpc", label: "Elysia tRPC plugin" },
    { name: "@elysiajs/graphql-yoga", pattern: "@elysiajs/graphql-yoga", label: "Elysia GraphQL Yoga plugin" },
    // Database
    { name: "drizzle-orm", pattern: "drizzle-orm", label: "Drizzle ORM" },
    { name: "@prisma/client", pattern: "@prisma/client", label: "Prisma ORM client" },
    { name: "prisma", pattern: "prisma", label: "Prisma CLI" },
    { name: "mongoose", pattern: "mongoose", label: "Mongoose (MongoDB ODM)" },
    { name: "kysely", pattern: "kysely", label: "Kysely (type-safe SQL query builder)" },
    // Validation
    { name: "zod", pattern: "zod", label: "Zod (schema validation)" },
    { name: "typebox", pattern: "@sinclair/typebox", label: "TypeBox (JSON Schema type builder)" },
    { name: "valibot", pattern: "valibot", label: "Valibot (schema validation)" },
    // Auth
    { name: "lucia", pattern: "lucia", label: "Lucia (authentication library)" },
    { name: "arctic", pattern: "arctic", label: "Arctic (OAuth 2.0 providers)" },
    // Types
    { name: "bun-types", pattern: "bun-types", label: "Bun type definitions" },
    { name: "@types/bun", pattern: "@types/bun", label: "Bun type definitions" },
    // Full-stack
    { name: "beth-stack", pattern: "beth-stack", label: "BETH Stack (Bun + Elysia + Turso + HTMX)" },
    { name: "@elysiajs/html", pattern: "@elysiajs/html", label: "Elysia HTML templating" },
    // Other
    { name: "tsx", pattern: "tsx", label: "tsx (TypeScript execute)" },
    { name: "vitest", pattern: "vitest", label: "Vitest (test framework, alternative to bun:test)" },
  ];

  for (const dep of depChecks) {
    if (hasDep(dep.pattern)) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  enrichment.patterns.push({ check: "Bun runtime", label: "Bun runtime (fast JavaScript/TypeScript runtime)" });

  if (isElysia) {
    enrichment.patterns.push({ check: "Elysia detected", label: "Elysia web framework (type-safe, plugin-based)" });
    enrichment.patterns.push({ check: "End-to-end type safety", label: "End-to-end type safety (Elysia + Eden client)" });
  }

  if (isHono) {
    enrichment.patterns.push({ check: "Hono on Bun", label: "Hono web framework on Bun" });
  }

  if (usesBunServe) {
    enrichment.patterns.push({ check: "Bun.serve detected", label: "Bun.serve (native HTTP server)" });
  }

  if (hasBunLockb || hasBunLock) {
    enrichment.patterns.push({ check: "Bun lockfile", label: `Bun lockfile (${hasBunLockb ? "bun.lockb binary" : "bun.lock"})` });
  }

  if (bunfigToml) {
    enrichment.patterns.push({ check: "bunfig.toml", label: "bunfig.toml (Bun configuration)" });
  }

  if (hasDep("drizzle-orm")) {
    enrichment.patterns.push({ check: "Drizzle detected", label: "Drizzle ORM (type-safe SQL)" });
  }

  if (hasDep("zod") || hasDep("@sinclair/typebox")) {
    enrichment.patterns.push({ check: "Schema validation", label: "Schema-based request validation" });
  }

  if (hasDep("beth-stack") || (isElysia && hasDep("@elysiajs/html") && mainEntry.includes("htmx"))) {
    enrichment.patterns.push({ check: "BETH stack", label: "BETH Stack (Bun + Elysia + Turso + HTMX)" });
  }

  // Check for Bun macros
  if (mainEntry.includes("with { type: 'macro' }") || mainEntry.includes('with { type: "macro" }')) {
    enrichment.patterns.push({ check: "Bun macros", label: "Bun macros (compile-time code execution)" });
  }

  // ─── Commands ──────────────────────────────────────────────

  // Prefer scripts from package.json
  if (scripts["dev"]) {
    enrichment.commands.push({ command: "bun run dev", description: "Start development server", category: "dev" });
  } else {
    enrichment.commands.push({ command: "bun run src/index.ts", description: "Start the application", category: "dev" });
  }

  if (scripts["dev"]) {
    // Already added above
  } else {
    enrichment.commands.push({ command: "bun run --watch src/index.ts", description: "Start with hot reload (watch mode)", category: "dev" });
  }

  enrichment.commands.push(
    { command: "bun test", description: "Run tests (bun:test)", category: "test" },
    { command: "bun test --coverage", description: "Run tests with code coverage", category: "test" },
  );

  if (scripts["build"]) {
    enrichment.commands.push({ command: "bun run build", description: "Build the project", category: "build" });
  } else {
    enrichment.commands.push({ command: "bun build src/index.ts --outdir ./dist", description: "Bundle for production", category: "build" });
  }

  enrichment.commands.push(
    { command: "bun install", description: "Install dependencies", category: "build" },
  );

  if (scripts["lint"]) {
    enrichment.commands.push({ command: "bun run lint", description: "Run linter", category: "lint" });
  }

  // Prisma
  if (hasDep("prisma") || hasDep("@prisma/client")) {
    enrichment.commands.push(
      { command: "bunx prisma migrate dev", description: "Apply pending Prisma migrations", category: "db" },
      { command: "bunx prisma generate", description: "Generate Prisma client", category: "db" },
      { command: "bunx prisma studio", description: "Open Prisma Studio (DB browser)", category: "db" },
    );
  }

  // Drizzle
  if (hasDep("drizzle-orm") && hasDep("drizzle-kit")) {
    enrichment.commands.push(
      { command: "bunx drizzle-kit push", description: "Push Drizzle schema changes to database", category: "db" },
      { command: "bunx drizzle-kit generate", description: "Generate Drizzle migration files", category: "db" },
      { command: "bunx drizzle-kit studio", description: "Open Drizzle Studio", category: "db" },
    );
  }

  // Compile to binary
  enrichment.commands.push(
    { command: "bun build src/index.ts --compile --outfile app", description: "Compile to standalone executable", category: "build" },
  );

  // Docker
  if (existsSync(join(rootDir, "Dockerfile")) || existsSync(join(rootDir, "docker-compose.yml"))) {
    enrichment.commands.push(
      { command: "docker compose up -d", description: "Start infrastructure services", category: "dev" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  // Check for bun:sqlite usage
  if (mainEntry.includes("bun:sqlite") || mainEntry.includes("Database(")) {
    enrichment.database = { ormName: "bun:sqlite (built-in SQLite)" };
  } else if (hasDep("drizzle-orm")) {
    enrichment.database = {
      ormName: "Drizzle ORM",
      migrationDir: existsSync(join(rootDir, "drizzle")) ? "drizzle/" : undefined,
    };
  } else if (hasDep("@prisma/client") || hasDep("prisma")) {
    enrichment.database = {
      ormName: "Prisma",
      schemaFile: existsSync(join(rootDir, "prisma/schema.prisma")) ? "prisma/schema.prisma" : undefined,
      migrationDir: existsSync(join(rootDir, "prisma/migrations")) ? "prisma/migrations" : undefined,
    };
  } else if (hasDep("mongoose")) {
    enrichment.database = { ormName: "Mongoose (MongoDB)" };
  } else if (hasDep("kysely")) {
    enrichment.database = { ormName: "Kysely" };
  }

  // ─── Testing ───────────────────────────────────────────────

  const usesVitest = hasDep("vitest");
  enrichment.testing = {
    framework: usesVitest ? "Vitest" : "bun:test (built-in)",
    testDir: "tests/ or src/**/*.test.ts",
    systemTestTools: [],
  };

  if (isElysia) {
    enrichment.testing.systemTestTools!.push("Elysia.handle() (in-process request testing)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T assume full Node.js API compatibility for all npm packages",
      reason: "Bun implements most Node.js APIs but some modules (native addons, niche Node internals) may not work. Check Bun's compatibility table and test npm packages before depending on them",
      severity: "important",
    },
    {
      rule: "DON'T use node: prefix imports without checking Bun support",
      reason: "While Bun supports most node: prefixed imports (node:fs, node:path, etc.), some Node.js-specific modules like node:diagnostics_channel have limited or no support. Verify in Bun docs",
      severity: "important",
    },
    {
      rule: "DON'T manually edit bun.lockb — it is a binary file",
      reason: "bun.lockb is a binary lockfile optimized for performance. Unlike package-lock.json, it cannot be manually edited. Use `bun install` to update it. Use `bun.lock` (text-based) if you need readable diffs",
      severity: "important",
    },
    {
      rule: "ALWAYS check Bun compatibility before using npm packages with native addons",
      reason: "Bun uses its own native module loading. Packages with C++ addons (node-gyp) may not compile or work correctly. Prefer pure-JS alternatives or Bun-native APIs",
      severity: "critical",
    },
    {
      rule: "DON'T use process.exit() — use Bun-native alternatives",
      reason: "While process.exit() works in Bun for compatibility, prefer clean shutdown patterns. For Bun.serve, return a response instead of exiting. For CLI tools, throw or use process.exitCode",
      severity: "nice-to-have",
    },
    {
      rule: "DON'T mix bun.lockb and package-lock.json in the same project",
      reason: "Having multiple lock files causes confusion about which package manager manages dependencies. Commit only the Bun lock file and add package-lock.json to .gitignore",
      severity: "important",
    },
    {
      rule: "DON'T use --bun flag in production without testing",
      reason: "The --bun flag forces Bun's runtime for node_modules scripts that typically use Node.js. This can break packages that depend on Node-specific behavior. Test thoroughly before using in production",
      severity: "important",
    },
    {
      rule: "ALWAYS use Bun.env instead of process.env for better performance",
      reason: "Bun.env is a faster alternative to process.env with lazy evaluation. process.env works but is slower due to Node.js compatibility overhead. Use Bun.env for Bun-native applications",
      severity: "nice-to-have",
    },
  );

  return enrichment;
}
