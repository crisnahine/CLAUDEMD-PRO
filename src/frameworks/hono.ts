/**
 * Hono Deep Analyzer
 *
 * Detects Hono-specific patterns, middleware-first architecture,
 * edge runtime compatibility, RPC mode, Zod validation, and common gotchas.
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

export function analyzeHono(
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
  const deps = {
    ...(allDeps.dependencies ?? {}),
    ...(allDeps.devDependencies ?? {}),
  };

  const honoVersion = deps["hono"] ?? keyDeps["hono"] ?? null;

  // Detect runtime target
  const isCloudflareWorkers = !!(deps["wrangler"] || existsSync(join(rootDir, "wrangler.toml")) || existsSync(join(rootDir, "wrangler.jsonc")));
  const isBun = !!(existsSync(join(rootDir, "bun.lockb")) || existsSync(join(rootDir, "bunfig.toml")));
  const isDeno = !!(existsSync(join(rootDir, "deno.json")) || existsSync(join(rootDir, "deno.lock")));
  const isNodeServer = !!(deps["@hono/node-server"]);

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "src/index.ts",
    "src/index.tsx",
    "src/app.ts",
    "src/server.ts",
    "index.ts",
    "wrangler.toml",
    "wrangler.jsonc",
  ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "src/": "Application source code",
    "src/routes/": "Route handlers and route definitions",
    "src/middleware/": "Custom middleware functions",
    "src/handlers/": "Request handlers (controller logic)",
  };

  const conditionalDirs: Record<string, string> = {
    "src/lib/": "Library code and shared modules",
    "src/utils/": "Utility functions and helpers",
    "src/types/": "TypeScript type definitions",
    "src/validators/": "Request validation schemas (Zod, Valibot)",
    "src/services/": "Business logic and service layer",
    "src/db/": "Database connection and queries",
    "src/models/": "Data models and schemas",
    "src/api/": "API route definitions",
    "functions/": "Cloudflare Pages Functions (if using Pages)",
  };

  for (const [dir, purpose] of Object.entries(conditionalDirs)) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[dir] = purpose;
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Core
    { name: "hono", pattern: "hono", label: `Hono${honoVersion ? ` (v${honoVersion})` : ""}` },
    // Middleware & validation
    { name: "@hono/zod-validator", pattern: "@hono/zod-validator", label: "Zod validator middleware" },
    { name: "@hono/valibot-validator", pattern: "@hono/valibot-validator", label: "Valibot validator middleware" },
    { name: "@hono/swagger-ui", pattern: "@hono/swagger-ui", label: "Swagger UI middleware" },
    { name: "@hono/zod-openapi", pattern: "@hono/zod-openapi", label: "Zod OpenAPI (type-safe API docs)" },
    // Auth
    { name: "@hono/clerk-auth", pattern: "@hono/clerk-auth", label: "Clerk authentication middleware" },
    // Runtime adapters
    { name: "@hono/node-server", pattern: "@hono/node-server", label: "Node.js server adapter" },
    { name: "wrangler", pattern: "wrangler", label: "Wrangler CLI (Cloudflare Workers)" },
    // Database
    { name: "drizzle-orm", pattern: "drizzle-orm", label: "Drizzle ORM" },
    { name: "@prisma/client", pattern: "@prisma/client", label: "Prisma ORM client" },
    { name: "d1", pattern: "@cloudflare/d1", label: "Cloudflare D1 (SQLite at the edge)" },
    // Validation
    { name: "zod", pattern: "zod", label: "Zod (schema validation)" },
    { name: "valibot", pattern: "valibot", label: "Valibot (schema validation)" },
    // Other
    { name: "hono-rate-limiter", pattern: "hono-rate-limiter", label: "Rate limiter middleware" },
    { name: "@hono/graphql-server", pattern: "@hono/graphql-server", label: "GraphQL server middleware" },
    { name: "@hono/trpc-server", pattern: "@hono/trpc-server", label: "tRPC server adapter" },
  ];

  for (const dep of depChecks) {
    if (deps[dep.pattern] || keyDeps[dep.pattern]) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  enrichment.patterns.push({ check: "Hono detected", label: "Middleware-first HTTP framework (Hono)" });
  enrichment.patterns.push({ check: "Edge-compatible", label: "Edge-runtime compatible (Web Standards API)" });

  // Detect runtime
  if (isCloudflareWorkers) {
    enrichment.patterns.push({ check: "Cloudflare Workers", label: "Cloudflare Workers/Pages deployment" });
  }
  if (isBun) {
    enrichment.patterns.push({ check: "Bun runtime", label: "Bun runtime" });
  }
  if (isDeno) {
    enrichment.patterns.push({ check: "Deno runtime", label: "Deno runtime" });
  }
  if (isNodeServer) {
    enrichment.patterns.push({ check: "Node.js adapter", label: "Node.js server adapter (@hono/node-server)" });
  }

  if (deps["@hono/zod-validator"] || deps["@hono/zod-openapi"]) {
    enrichment.patterns.push({ check: "Zod validation", label: "Zod-based request validation middleware" });
  }

  if (deps["@hono/zod-openapi"] || deps["@hono/swagger-ui"]) {
    enrichment.patterns.push({ check: "OpenAPI docs", label: "OpenAPI/Swagger documentation" });
  }

  if (deps["@hono/trpc-server"]) {
    enrichment.patterns.push({ check: "tRPC", label: "tRPC server for type-safe RPC" });
  }

  // Check for RPC mode usage in source files
  const mainEntry = readSafe(join(rootDir, "src/index.ts")) ?? readSafe(join(rootDir, "src/app.ts")) ?? "";
  if (mainEntry.includes("hc<") || mainEntry.includes("hono/client")) {
    enrichment.patterns.push({ check: "RPC mode", label: "Hono RPC mode (type-safe client from server types)" });
  }

  // ─── Commands ──────────────────────────────────────────────

  if (isCloudflareWorkers) {
    enrichment.commands.push(
      { command: "wrangler dev", description: "Start local Cloudflare Workers dev server", category: "dev" },
      { command: "wrangler deploy", description: "Deploy to Cloudflare Workers", category: "deploy" },
      { command: "wrangler tail", description: "Stream live logs from deployed Worker", category: "other" },
    );
  } else if (isBun) {
    enrichment.commands.push(
      { command: "bun run src/index.ts", description: "Start Hono dev server (Bun)", category: "dev" },
      { command: "bun run --watch src/index.ts", description: "Start dev server with watch mode (Bun)", category: "dev" },
    );
  } else if (isDeno) {
    enrichment.commands.push(
      { command: "deno run --allow-net src/index.ts", description: "Start Hono dev server (Deno)", category: "dev" },
    );
  } else {
    enrichment.commands.push(
      { command: "npm run dev", description: "Start Hono development server", category: "dev" },
    );
  }

  enrichment.commands.push(
    { command: "npm run build", description: "Build for production", category: "build" },
  );

  if (deps["vitest"]) {
    enrichment.commands.push(
      { command: "npx vitest", description: "Run tests with Vitest", category: "test" },
    );
  }

  if (deps["eslint"]) {
    enrichment.commands.push(
      { command: "npx eslint .", description: "Run ESLint", category: "lint" },
    );
  }

  // Prisma
  if (deps["@prisma/client"] || deps["prisma"]) {
    enrichment.commands.push(
      { command: "npx prisma migrate dev", description: "Apply pending Prisma migrations", category: "db" },
      { command: "npx prisma generate", description: "Generate Prisma client from schema", category: "db" },
    );
  }

  // Wrangler D1
  if (deps["@cloudflare/d1"] || isCloudflareWorkers) {
    enrichment.commands.push(
      { command: "wrangler d1 migrations apply <db>", description: "Apply D1 database migrations", category: "db" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  if (deps["drizzle-orm"]) {
    enrichment.database = { ormName: "Drizzle ORM" };
  } else if (deps["@prisma/client"] || deps["prisma"]) {
    enrichment.database = {
      ormName: "Prisma",
      schemaFile: existsSync(join(rootDir, "prisma/schema.prisma")) ? "prisma/schema.prisma" : undefined,
      migrationDir: existsSync(join(rootDir, "prisma/migrations")) ? "prisma/migrations" : undefined,
    };
  } else if (deps["@cloudflare/d1"]) {
    enrichment.database = { ormName: "Cloudflare D1 (SQLite at the edge)" };
  }

  // ─── Testing ───────────────────────────────────────────────

  enrichment.testing = {
    framework: deps["vitest"] ? "Vitest" : "Vitest (recommended)",
    testDir: "src/**/*.test.ts or tests/",
    systemTestTools: [],
  };

  if (isCloudflareWorkers) {
    enrichment.testing.systemTestTools!.push("Miniflare (local Workers simulation)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T use Node.js-specific APIs directly — Hono targets edge runtimes",
      reason: "Hono is designed for Web Standards API (Request, Response, fetch). Using Node.js APIs (fs, path, Buffer) breaks compatibility with Cloudflare Workers, Deno, and Bun. Use the Web APIs or polyfills",
      severity: "critical",
    },
    {
      rule: "Use c.json() instead of new Response() for typed responses",
      reason: "c.json() preserves type information for Hono's RPC mode and client type inference. Using the raw Response constructor loses type safety and breaks hc<AppType>() client generation",
      severity: "important",
    },
    {
      rule: "DON'T forget to chain middleware with app.use() before route handlers",
      reason: "Hono middleware runs in registration order. Define middleware (CORS, auth, logging) before the routes that need them. Middleware registered after a route won't apply to it",
      severity: "important",
    },
    {
      rule: "DON'T mutate the context object (c) — use c.set()/c.get() for request-scoped data",
      reason: "Hono's context is typed and immutable. Use c.set('key', value) and c.get('key') with proper type declarations for passing data between middleware and handlers",
      severity: "important",
    },
    {
      rule: "ALWAYS use c.env for environment variables in Cloudflare Workers",
      reason: "Cloudflare Workers bind environment variables per-request via c.env, not process.env. Accessing process.env returns undefined in Workers runtime",
      severity: "critical",
    },
    {
      rule: "DON'T use blocking operations — all I/O must be async",
      reason: "Edge runtimes have strict execution time limits (e.g., 30s on Cloudflare Workers). Long-running sync operations will timeout. Use async/await for all I/O",
      severity: "important",
    },
  );

  return enrichment;
}
