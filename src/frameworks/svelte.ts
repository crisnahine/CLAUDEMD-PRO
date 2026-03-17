/**
 * Svelte / SvelteKit Deep Analyzer
 *
 * Detects SvelteKit and plain Svelte patterns, file-based routing,
 * load functions, form actions, runes, adapters, and common gotchas.
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

export function analyzeSvelte(
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

  const isSvelteKit = !!(deps["@sveltejs/kit"] || keyDeps["@sveltejs/kit"]);
  const svelteVersion = deps["svelte"] ?? keyDeps["svelte"] ?? null;

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = isSvelteKit
    ? [
        "svelte.config.js",
        "svelte.config.ts",
        "src/routes/+page.svelte",
        "src/routes/+layout.svelte",
        "src/app.html",
        "src/hooks.server.ts",
        "src/hooks.server.js",
        "vite.config.ts",
        "vite.config.js",
      ]
    : [
        "svelte.config.js",
        "src/App.svelte",
        "src/main.ts",
        "src/main.js",
        "vite.config.ts",
        "vite.config.js",
      ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  if (isSvelteKit) {
    enrichment.dirPurposes = {
      "src/routes/": "File-based routing — +page.svelte, +layout.svelte, +server.ts",
      "src/lib/": "Library code — importable via $lib alias",
      "src/lib/components/": "Reusable Svelte components",
      "src/lib/server/": "Server-only library code (never sent to client)",
      "src/params/": "Route parameter matchers",
      "static/": "Static assets served at root (favicon, images)",
      "src/": "Application source code",
    };

    const conditionalDirs: Record<string, string> = {
      "src/lib/stores/": "Svelte stores (shared reactive state)",
      "src/lib/utils/": "Utility functions and helpers",
      "src/lib/types/": "TypeScript type definitions",
      "src/lib/styles/": "Global styles and CSS utilities",
      "src/hooks/": "SvelteKit hooks (handle, handleError, handleFetch)",
    };

    for (const [dir, purpose] of Object.entries(conditionalDirs)) {
      if (existsSync(join(rootDir, dir))) {
        enrichment.dirPurposes[dir] = purpose;
      }
    }
  } else {
    enrichment.dirPurposes = {
      "src/": "Application source code",
      "src/components/": "Svelte components",
      "src/stores/": "Svelte stores (shared reactive state)",
      "public/": "Static assets",
    };
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Core
    { name: "svelte", pattern: "svelte", label: `Svelte${svelteVersion ? ` (v${svelteVersion})` : ""}` },
    { name: "@sveltejs/kit", pattern: "@sveltejs/kit", label: "SvelteKit (full-stack framework)" },
    // Adapters
    { name: "@sveltejs/adapter-auto", pattern: "@sveltejs/adapter-auto", label: "SvelteKit auto adapter (platform detection)" },
    { name: "@sveltejs/adapter-node", pattern: "@sveltejs/adapter-node", label: "SvelteKit Node.js adapter" },
    { name: "@sveltejs/adapter-static", pattern: "@sveltejs/adapter-static", label: "SvelteKit static adapter (SSG)" },
    { name: "@sveltejs/adapter-vercel", pattern: "@sveltejs/adapter-vercel", label: "SvelteKit Vercel adapter" },
    { name: "@sveltejs/adapter-cloudflare", pattern: "@sveltejs/adapter-cloudflare", label: "SvelteKit Cloudflare adapter" },
    // Build
    { name: "svelte-preprocess", pattern: "svelte-preprocess", label: "Svelte preprocessor (SCSS, PostCSS, TypeScript)" },
    { name: "@sveltejs/vite-plugin-svelte", pattern: "@sveltejs/vite-plugin-svelte", label: "Svelte Vite plugin" },
    // Forms & validation
    { name: "sveltekit-superforms", pattern: "sveltekit-superforms", label: "Superforms (type-safe form handling)" },
    { name: "formsnap", pattern: "formsnap", label: "Formsnap (accessible form components)" },
    // UI
    { name: "bits-ui", pattern: "bits-ui", label: "Bits UI (headless component library)" },
    { name: "melt-ui", pattern: "melt-ui", label: "Melt UI (headless builders)" },
    { name: "skeleton", pattern: "@skeletonlabs/skeleton", label: "Skeleton UI (component toolkit)" },
    // Auth
    { name: "lucia", pattern: "lucia", label: "Lucia (authentication library)" },
    // Other
    { name: "svelte-i18n", pattern: "svelte-i18n", label: "svelte-i18n (internationalization)" },
    { name: "svelte-meta-tags", pattern: "svelte-meta-tags", label: "Svelte Meta Tags (SEO)" },
  ];

  for (const dep of depChecks) {
    if (deps[dep.pattern] || keyDeps[dep.pattern]) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  if (isSvelteKit) {
    enrichment.patterns.push({ check: "SvelteKit detected", label: "File-based routing (+page.svelte, +layout.svelte)" });
    enrichment.patterns.push({ check: "Server-side load", label: "Server-side load functions (+page.server.ts, +layout.server.ts)" });
    enrichment.patterns.push({ check: "Form actions", label: "Form actions for progressive enhancement (+page.server.ts)" });

    if (existsSync(join(rootDir, "src/hooks.server.ts")) || existsSync(join(rootDir, "src/hooks.server.js"))) {
      enrichment.patterns.push({ check: "Server hooks", label: "Server hooks (handle, handleError, handleFetch)" });
    }

    if (existsSync(join(rootDir, "src/lib/server"))) {
      enrichment.patterns.push({ check: "Server-only lib", label: "Server-only code separation ($lib/server/)" });
    }
  } else {
    enrichment.patterns.push({ check: "Svelte detected", label: "Svelte component framework (no SvelteKit)" });
  }

  // Svelte 5 runes
  if (svelteVersion && (svelteVersion.startsWith("5") || svelteVersion.startsWith("^5") || svelteVersion.startsWith("~5"))) {
    enrichment.patterns.push({ check: "Svelte 5 runes", label: "Svelte 5 runes ($state, $derived, $effect)" });
  }

  if (deps["sveltekit-superforms"]) {
    enrichment.patterns.push({ check: "Superforms", label: "Type-safe forms with validation (Superforms)" });
  }

  if (deps["@sveltejs/adapter-static"]) {
    enrichment.patterns.push({ check: "Static adapter", label: "Static site generation (SSG mode)" });
  }

  // ─── Commands ──────────────────────────────────────────────

  enrichment.commands.push(
    { command: "npm run dev", description: "Start Vite dev server with HMR", category: "dev" },
    { command: "npm run build", description: "Build for production", category: "build" },
    { command: "npm run preview", description: "Preview production build locally", category: "deploy" },
  );

  if (isSvelteKit) {
    enrichment.commands.push(
      { command: "npx svelte-kit sync", description: "Sync SvelteKit generated types", category: "build" },
    );
  }

  if (deps["svelte-check"]) {
    enrichment.commands.push(
      { command: "npx svelte-check", description: "Run Svelte type checker and diagnostics", category: "lint" },
    );
  }

  if (deps["vitest"]) {
    enrichment.commands.push(
      { command: "npx vitest", description: "Run tests with Vitest", category: "test" },
    );
  }

  if (deps["playwright"] || deps["@playwright/test"]) {
    enrichment.commands.push(
      { command: "npx playwright test", description: "Run Playwright E2E tests", category: "test" },
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

  enrichment.testing = {
    framework: deps["vitest"] ? "Vitest" : "Vitest (recommended)",
    testDir: "src/**/*.test.ts or tests/",
    systemTestTools: [],
  };

  if (deps["@testing-library/svelte"]) {
    enrichment.testing.systemTestTools!.push("@testing-library/svelte (component testing)");
  }
  if (deps["playwright"] || deps["@playwright/test"]) {
    enrichment.testing.systemTestTools!.push("Playwright (E2E browser testing)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T import server-only code in +page.svelte or client components",
      reason: "Code in +page.svelte runs on both server and client. Import server-only code (DB, secrets, fs) only in +page.server.ts or $lib/server/. SvelteKit will error if server code leaks to client bundle",
      severity: "critical",
    },
    {
      rule: "DON'T modify .svelte-kit/ directory",
      reason: ".svelte-kit/ is auto-generated and contains framework types, route manifests, and build output. Run `svelte-kit sync` to regenerate it",
      severity: "critical",
    },
    {
      rule: "Load functions run on both server and client by default",
      reason: "Universal load functions (+page.ts) execute on the server during SSR and on the client during navigation. Use +page.server.ts for server-only loads (DB queries, secrets)",
      severity: "important",
    },
    {
      rule: "DON'T use $lib imports in server routes for client-only code",
      reason: "Server routes (+server.ts) only run on the server. Importing client-side Svelte components or browser APIs will break the build",
      severity: "important",
    },
    {
      rule: "ALWAYS export form actions from +page.server.ts, not +server.ts",
      reason: "Form actions are defined as named exports in +page.server.ts. Using +server.ts for forms bypasses SvelteKit's progressive enhancement and error handling",
      severity: "important",
    },
  );

  // Svelte 5 specific gotcha
  if (svelteVersion && (svelteVersion.startsWith("5") || svelteVersion.startsWith("^5") || svelteVersion.startsWith("~5"))) {
    enrichment.gotchas.push({
      rule: "DON'T destructure $state rune values — use $derived for computed values",
      reason: "Runes ($state, $derived, $effect) are compiler directives in Svelte 5. Destructuring loses reactivity. Use $derived() for computed values instead of manual let bindings",
      severity: "important",
    });
  }

  return enrichment;
}
