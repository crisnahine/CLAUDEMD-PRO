/**
 * Remix Deep Analyzer
 *
 * Detects Remix-specific patterns, nested routing, loaders/actions,
 * resource routes, progressive enhancement, and common gotchas.
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

export function analyzeRemix(
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

  const remixVersion = deps["@remix-run/react"] ?? deps["@remix-run/node"] ?? keyDeps["@remix-run/react"] ?? null;

  // Detect Remix v2 vs v1 (v2 uses Vite, flat routes by default)
  const isViteBased = !!(deps["@remix-run/vite"] || existsSync(join(rootDir, "vite.config.ts")) || existsSync(join(rootDir, "vite.config.js")));

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "vite.config.ts",
    "vite.config.js",
    "remix.config.js",
    "remix.config.ts",
    "app/root.tsx",
    "app/root.jsx",
    "app/entry.server.tsx",
    "app/entry.client.tsx",
  ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "app/": "Application source code (Remix app directory)",
    "app/routes/": "File-based nested routing — each file is a route segment",
    "app/components/": "Reusable React components",
    "app/models/": "Data models and database access layer",
    "app/utils/": "Utility functions and shared helpers",
    "app/services/": "Business logic and external service integrations",
    "app/styles/": "CSS and stylesheets",
    "public/": "Static assets served at root",
  };

  const conditionalDirs: Record<string, string> = {
    "app/lib/": "Library code and shared modules",
    "app/hooks/": "Custom React hooks",
    "app/context/": "React context providers",
    "app/types/": "TypeScript type definitions",
    "app/sessions/": "Session storage configuration",
    "app/cookies/": "Cookie configuration",
    "app/queues/": "Background job queues",
  };

  for (const [dir, purpose] of Object.entries(conditionalDirs)) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[dir] = purpose;
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Core
    { name: "@remix-run/react", pattern: "@remix-run/react", label: `Remix React${remixVersion ? ` (v${remixVersion})` : ""}` },
    { name: "@remix-run/node", pattern: "@remix-run/node", label: "Remix Node.js runtime" },
    { name: "@remix-run/serve", pattern: "@remix-run/serve", label: "Remix App Server (built-in Express)" },
    // Runtimes
    { name: "@remix-run/cloudflare", pattern: "@remix-run/cloudflare", label: "Remix Cloudflare runtime" },
    { name: "@remix-run/deno", pattern: "@remix-run/deno", label: "Remix Deno runtime" },
    { name: "@remix-run/express", pattern: "@remix-run/express", label: "Remix Express adapter" },
    // Auth
    { name: "remix-auth", pattern: "remix-auth", label: "Remix Auth (authentication strategies)" },
    { name: "remix-auth-form", pattern: "remix-auth-form", label: "Remix Auth form strategy" },
    { name: "remix-auth-oauth2", pattern: "remix-auth-oauth2", label: "Remix Auth OAuth2 strategy" },
    // Forms
    { name: "remix-validated-form", pattern: "remix-validated-form", label: "Remix Validated Form (type-safe forms)" },
    { name: "conform", pattern: "@conform-to/react", label: "Conform (progressive form validation)" },
    // Database
    { name: "@prisma/client", pattern: "@prisma/client", label: "Prisma ORM client" },
    { name: "drizzle-orm", pattern: "drizzle-orm", label: "Drizzle ORM" },
    // Other
    { name: "remix-flat-routes", pattern: "remix-flat-routes", label: "Flat routes convention" },
    { name: "remix-utils", pattern: "remix-utils", label: "Remix Utils (helper functions)" },
    { name: "remix-i18next", pattern: "remix-i18next", label: "Remix i18next (internationalization)" },
    { name: "remix-toast", pattern: "remix-toast", label: "Remix Toast (flash notifications)" },
  ];

  for (const dep of depChecks) {
    if (deps[dep.pattern] || keyDeps[dep.pattern]) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  enrichment.patterns.push({ check: "Remix detected", label: "Nested routing with layout composition (app/routes/)" });
  enrichment.patterns.push({ check: "Loaders/Actions", label: "Loaders (GET data) and Actions (mutations) — server-first data flow" });
  enrichment.patterns.push({ check: "Progressive enhancement", label: "Progressive enhancement (forms work without JavaScript)" });

  if (existsSync(join(rootDir, "app/routes"))) {
    try {
      const routeFiles = readdirSync(join(rootDir, "app/routes"));
      const resourceRoutes = routeFiles.filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
      if (resourceRoutes.length > 0) {
        enrichment.patterns.push({ check: "Resource routes", label: "Resource routes (API endpoints, webhooks, file downloads)" });
      }
    } catch { /* permission denied */ }
  }

  if (deps["remix-auth"]) {
    enrichment.patterns.push({ check: "Remix Auth", label: "Strategy-based authentication (remix-auth)" });
  }

  if (deps["remix-validated-form"] || deps["@conform-to/react"]) {
    enrichment.patterns.push({ check: "Form validation", label: "Type-safe form validation with progressive enhancement" });
  }

  if (isViteBased) {
    enrichment.patterns.push({ check: "Vite", label: "Vite-based build (Remix v2+)" });
  }

  if (deps["@remix-run/cloudflare"]) {
    enrichment.patterns.push({ check: "Cloudflare runtime", label: "Cloudflare Workers/Pages runtime" });
  }

  // ─── Commands ──────────────────────────────────────────────

  enrichment.commands.push(
    { command: "remix dev", description: "Start Remix development server with HMR", category: "dev" },
    { command: "remix build", description: "Build for production", category: "build" },
  );

  if (deps["@remix-run/serve"]) {
    enrichment.commands.push(
      { command: "remix-serve build/server/index.js", description: "Start production server (Remix App Server)", category: "deploy" },
    );
  }

  if (deps["vitest"]) {
    enrichment.commands.push(
      { command: "npx vitest", description: "Run tests with Vitest", category: "test" },
    );
  } else if (deps["jest"]) {
    enrichment.commands.push(
      { command: "npx jest", description: "Run tests with Jest", category: "test" },
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
      { command: "npx prisma studio", description: "Open Prisma Studio (DB browser)", category: "db" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  if (deps["@prisma/client"] || deps["prisma"]) {
    enrichment.database = {
      ormName: "Prisma",
      schemaFile: existsSync(join(rootDir, "prisma/schema.prisma")) ? "prisma/schema.prisma" : undefined,
      migrationDir: existsSync(join(rootDir, "prisma/migrations")) ? "prisma/migrations" : undefined,
    };
  } else if (deps["drizzle-orm"]) {
    enrichment.database = { ormName: "Drizzle ORM" };
  }

  // ─── Testing ───────────────────────────────────────────────

  const testFramework = deps["vitest"] ? "Vitest" : deps["jest"] ? "Jest" : "Vitest (recommended)";
  enrichment.testing = {
    framework: testFramework,
    testDir: "app/**/*.test.ts or tests/",
    systemTestTools: [],
  };

  if (deps["@testing-library/react"]) {
    enrichment.testing.systemTestTools!.push("@testing-library/react (component testing)");
  }
  if (deps["playwright"] || deps["@playwright/test"]) {
    enrichment.testing.systemTestTools!.push("Playwright (E2E browser testing)");
  }
  if (deps["cypress"]) {
    enrichment.testing.systemTestTools!.push("Cypress (E2E browser testing)");
  }
  if (deps["msw"]) {
    enrichment.testing.systemTestTools!.push("MSW (API mocking)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T throw a Response in action/loader without a proper HTTP status code",
      reason: "Thrown responses without status codes default to 200, which can mask errors. Use `throw json({ error: 'msg' }, { status: 400 })` or `throw redirect('/path')` for proper HTTP semantics",
      severity: "critical",
    },
    {
      rule: "DON'T use useEffect for data fetching — use the loader function",
      reason: "Remix loaders run on the server before render, avoiding loading spinners and waterfalls. useEffect data fetching defeats the purpose of server-side data loading and causes layout shifts",
      severity: "critical",
    },
    {
      rule: "Every route module can export loader, action, default, meta, links, headers",
      reason: "Remix route modules are co-located: data loading (loader), mutations (action), UI (default export), and metadata (meta) all live in the same file. This is intentional — embrace the convention",
      severity: "important",
    },
    {
      rule: "DON'T call loader/action functions directly from client code",
      reason: "Loaders and actions run only on the server. Use useFetcher() or <Form> to trigger them from the client. Direct imports will include server code in the client bundle",
      severity: "critical",
    },
    {
      rule: "DON'T forget to return from loader and action functions",
      reason: "Loaders must return a Response (use json() or redirect()). Actions must return a Response after processing. A missing return causes a runtime error in production",
      severity: "important",
    },
    {
      rule: "ALWAYS use <Form> instead of <form> for progressive enhancement",
      reason: "Remix's <Form> component handles navigation, pending UI, and works without JavaScript. Plain HTML <form> bypasses Remix's revalidation and error handling",
      severity: "important",
    },
  );

  return enrichment;
}
