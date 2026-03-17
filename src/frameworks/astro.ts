/**
 * Astro Deep Analyzer
 *
 * Detects Astro-specific patterns, islands architecture, content collections,
 * framework integrations (React, Vue, Svelte), and common gotchas.
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

export function analyzeAstro(
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

  const astroVersion = deps["astro"] ?? keyDeps["astro"] ?? null;

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "astro.config.mjs",
    "astro.config.ts",
    "astro.config.js",
    "src/pages/index.astro",
    "src/content/config.ts",
    "src/content/config.js",
  ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "src/pages/": "File-based routing — .astro, .md, .mdx files become routes",
    "src/components/": "Reusable components (.astro, .tsx, .vue, .svelte)",
    "src/layouts/": "Page layout wrappers (shared HTML structure)",
    "src/content/": "Content collections (typed Markdown/MDX/YAML/JSON)",
    "src/styles/": "Global stylesheets",
    "public/": "Static assets served at root (unprocessed by build)",
    "src/": "Application source code",
  };

  const conditionalDirs: Record<string, string> = {
    "src/pages/api/": "API endpoints (server-side route handlers)",
    "src/middleware/": "Request middleware (runs before page rendering)",
    "src/assets/": "Build-processed assets (optimized images, etc.)",
    "src/utils/": "Utility functions and helpers",
    "src/lib/": "Library code and shared modules",
    "src/data/": "Data files and content schemas",
    "src/actions/": "Astro actions (type-safe server functions)",
  };

  for (const [dir, purpose] of Object.entries(conditionalDirs)) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[dir] = purpose;
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Core
    { name: "astro", pattern: "astro", label: `Astro${astroVersion ? ` (v${astroVersion})` : ""}` },
    // UI framework integrations
    { name: "@astrojs/react", pattern: "@astrojs/react", label: "React integration (islands)" },
    { name: "@astrojs/vue", pattern: "@astrojs/vue", label: "Vue integration (islands)" },
    { name: "@astrojs/svelte", pattern: "@astrojs/svelte", label: "Svelte integration (islands)" },
    { name: "@astrojs/solid-js", pattern: "@astrojs/solid-js", label: "Solid.js integration (islands)" },
    { name: "@astrojs/preact", pattern: "@astrojs/preact", label: "Preact integration (islands)" },
    { name: "@astrojs/lit", pattern: "@astrojs/lit", label: "Lit integration (web components)" },
    // Content & rendering
    { name: "@astrojs/mdx", pattern: "@astrojs/mdx", label: "MDX support (Markdown + JSX)" },
    { name: "@astrojs/markdoc", pattern: "@astrojs/markdoc", label: "Markdoc content format" },
    // Styling
    { name: "@astrojs/tailwind", pattern: "@astrojs/tailwind", label: "Tailwind CSS integration" },
    // SSR adapters
    { name: "@astrojs/node", pattern: "@astrojs/node", label: "Node.js SSR adapter" },
    { name: "@astrojs/vercel", pattern: "@astrojs/vercel", label: "Vercel SSR adapter" },
    { name: "@astrojs/cloudflare", pattern: "@astrojs/cloudflare", label: "Cloudflare SSR adapter" },
    { name: "@astrojs/netlify", pattern: "@astrojs/netlify", label: "Netlify SSR adapter" },
    { name: "@astrojs/deno", pattern: "@astrojs/deno", label: "Deno SSR adapter" },
    // Database
    { name: "@astrojs/db", pattern: "@astrojs/db", label: "Astro DB (built-in libSQL database)" },
    // Other
    { name: "@astrojs/sitemap", pattern: "@astrojs/sitemap", label: "Sitemap generation" },
    { name: "@astrojs/rss", pattern: "@astrojs/rss", label: "RSS feed generation" },
    { name: "astro-icon", pattern: "astro-icon", label: "Astro Icon (SVG icon component)" },
    { name: "@astrojs/check", pattern: "@astrojs/check", label: "Astro type checker" },
  ];

  for (const dep of depChecks) {
    if (deps[dep.pattern] || keyDeps[dep.pattern]) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  enrichment.patterns.push({ check: "Astro detected", label: "Islands architecture (zero JS by default, hydrate on demand)" });
  enrichment.patterns.push({ check: "File-based routing", label: "File-based routing (src/pages/ directory)" });

  // Detect content collections
  if (existsSync(join(rootDir, "src/content/config.ts")) || existsSync(join(rootDir, "src/content/config.js"))) {
    enrichment.patterns.push({ check: "Content collections", label: "Content collections with typed schemas (src/content/)" });
  } else if (existsSync(join(rootDir, "src/content"))) {
    enrichment.patterns.push({ check: "Content directory", label: "Content directory (src/content/)" });
  }

  // Detect framework islands
  const frameworkIntegrations: string[] = [];
  if (deps["@astrojs/react"]) frameworkIntegrations.push("React");
  if (deps["@astrojs/vue"]) frameworkIntegrations.push("Vue");
  if (deps["@astrojs/svelte"]) frameworkIntegrations.push("Svelte");
  if (deps["@astrojs/solid-js"]) frameworkIntegrations.push("Solid");
  if (deps["@astrojs/preact"]) frameworkIntegrations.push("Preact");

  if (frameworkIntegrations.length > 0) {
    enrichment.patterns.push({
      check: "UI framework islands",
      label: `Interactive islands: ${frameworkIntegrations.join(", ")} (client: directives for hydration)`,
    });
  }

  // SSR mode detection
  const hasSSRAdapter = !!(
    deps["@astrojs/node"] || deps["@astrojs/vercel"] || deps["@astrojs/cloudflare"] ||
    deps["@astrojs/netlify"] || deps["@astrojs/deno"]
  );
  if (hasSSRAdapter) {
    enrichment.patterns.push({ check: "SSR adapter", label: "Server-side rendering enabled (hybrid or server mode)" });
  } else {
    enrichment.patterns.push({ check: "Static output", label: "Static site generation (default output mode)" });
  }

  if (deps["@astrojs/mdx"]) {
    enrichment.patterns.push({ check: "MDX support", label: "MDX content (Markdown + interactive components)" });
  }

  if (deps["@astrojs/db"]) {
    enrichment.patterns.push({ check: "Astro DB", label: "Built-in Astro DB (libSQL, type-safe queries)" });
  }

  // ─── Commands ──────────────────────────────────────────────

  enrichment.commands.push(
    { command: "astro dev", description: "Start Astro development server", category: "dev" },
    { command: "astro build", description: "Build for production", category: "build" },
    { command: "astro preview", description: "Preview production build locally", category: "deploy" },
    { command: "astro add <integration>", description: "Add an Astro integration (React, Tailwind, etc.)", category: "other" },
    { command: "astro sync", description: "Generate TypeScript types for content collections", category: "build" },
  );

  if (deps["@astrojs/check"]) {
    enrichment.commands.push(
      { command: "astro check", description: "Run Astro type checker and diagnostics", category: "lint" },
    );
  }

  if (deps["@astrojs/db"]) {
    enrichment.commands.push(
      { command: "astro db push", description: "Push Astro DB schema changes", category: "db" },
    );
  }

  if (deps["vitest"]) {
    enrichment.commands.push(
      { command: "npx vitest", description: "Run tests with Vitest", category: "test" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  if (deps["@astrojs/db"]) {
    enrichment.database = {
      ormName: "Astro DB (libSQL)",
      schemaFile: existsSync(join(rootDir, "db/config.ts")) ? "db/config.ts" : undefined,
    };
  } else if (deps["@prisma/client"] || deps["prisma"]) {
    enrichment.database = {
      ormName: "Prisma",
      schemaFile: existsSync(join(rootDir, "prisma/schema.prisma")) ? "prisma/schema.prisma" : undefined,
      migrationDir: existsSync(join(rootDir, "prisma/migrations")) ? "prisma/migrations" : undefined,
    };
  } else if (deps["drizzle-orm"]) {
    enrichment.database = { ormName: "Drizzle ORM" };
  }

  // ─── Testing ───────────────────────────────────────────────

  enrichment.testing = {
    framework: deps["vitest"] ? "Vitest" : "Vitest (recommended)",
    testDir: "src/**/*.test.ts or tests/",
    systemTestTools: [],
  };

  if (deps["playwright"] || deps["@playwright/test"]) {
    enrichment.testing.systemTestTools!.push("Playwright (E2E browser testing)");
  }
  if (deps["@testing-library/dom"]) {
    enrichment.testing.systemTestTools!.push("Testing Library (DOM testing)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T use client-side JS in .astro files without a client: directive",
      reason: "Astro components render to static HTML by default — no JavaScript is sent to the browser. To make a component interactive, use client:load, client:visible, client:idle, or client:only on framework component islands",
      severity: "critical",
    },
    {
      rule: "DON'T modify .astro/ build cache directory",
      reason: ".astro/ contains generated types and build cache. It's recreated during dev/build. Run `astro sync` to regenerate content collection types",
      severity: "critical",
    },
    {
      rule: "Content collections require a schema definition in src/content/config.ts",
      reason: "Each content collection needs a schema defined with defineCollection() and a Zod schema. Without it, content queries won't be type-safe and may fail at build time",
      severity: "important",
    },
    {
      rule: "DON'T use <script> in .astro for client interactivity — it runs at build time",
      reason: "The frontmatter (---) section and <script> without is:inline run during build/SSR, not in the browser. Use <script is:inline> for client JS, or use a framework island component",
      severity: "critical",
    },
    {
      rule: "DON'T mix multiple UI frameworks in the same island",
      reason: "Each island component uses a single framework. A React island cannot contain a Vue component. Use separate islands for different frameworks and they hydrate independently",
      severity: "important",
    },
    {
      rule: "ALWAYS specify the right client: directive for hydration performance",
      reason: "client:load hydrates immediately, client:idle waits for idle, client:visible waits for viewport entry. Choose wisely — unnecessary client:load adds to page load time",
      severity: "important",
    },
  );

  return enrichment;
}
