/**
 * Nuxt Deep Analyzer
 *
 * Detects Nuxt-specific patterns, auto-imports, Nitro server routes,
 * Pinia stores, content modules, and common gotchas.
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

export function analyzeNuxt(
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

  // Detect Nuxt version
  const nuxtVersion = deps["nuxt"] ?? keyDeps["nuxt"] ?? null;
  const isNuxt3 = !nuxtVersion || !nuxtVersion.startsWith("2");

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "nuxt.config.ts",
    "nuxt.config.js",
    "app.vue",
    "app.config.ts",
    "pages/index.vue",
  ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "pages/": "File-based routing — each .vue file becomes a route",
    "components/": "Auto-imported Vue components (no manual imports needed)",
    "composables/": "Auto-imported Vue composables (shared reactive logic)",
    "server/": "Nitro server engine (API routes, middleware, plugins)",
    "server/api/": "Server API routes — auto-registered as /api/* endpoints",
    "server/routes/": "Server routes — auto-registered at their file path",
    "server/middleware/": "Server middleware (runs on every request)",
    "server/plugins/": "Nitro server plugins (lifecycle hooks)",
    "layouts/": "Page layout wrappers (default.vue, custom layouts)",
    "plugins/": "Client/server plugins (run at app initialization)",
    "middleware/": "Route middleware (navigation guards)",
    "stores/": "Pinia state management stores",
    "public/": "Static assets served at root (favicon, robots.txt)",
    "assets/": "Build-processed assets (CSS, images, fonts)",
    "utils/": "Auto-imported utility functions",
    "content/": "Markdown/YAML content files (Nuxt Content module)",
  };

  // Only include dirs that exist
  const conditionalDirs: Record<string, string> = {
    "server/utils/": "Server-side utility functions (auto-imported in server/)",
    "modules/": "Local Nuxt modules (project-specific extensions)",
    "layers/": "Nuxt layers (shared configuration and code)",
    "i18n/": "Internationalization locale files",
  };

  for (const [dir, purpose] of Object.entries(conditionalDirs)) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[dir] = purpose;
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Core
    { name: "nuxt", pattern: "nuxt", label: `Nuxt framework${nuxtVersion ? ` (v${nuxtVersion})` : ""}` },
    // Official modules
    { name: "@nuxt/content", pattern: "@nuxt/content", label: "Nuxt Content (Markdown/YAML CMS)" },
    { name: "@nuxt/image", pattern: "@nuxt/image", label: "Nuxt Image (optimized images)" },
    { name: "@nuxt/ui", pattern: "@nuxt/ui", label: "Nuxt UI (component library)" },
    { name: "@nuxt/fonts", pattern: "@nuxt/fonts", label: "Nuxt Fonts (font optimization)" },
    { name: "@nuxt/devtools", pattern: "@nuxt/devtools", label: "Nuxt DevTools" },
    { name: "@nuxt/test-utils", pattern: "@nuxt/test-utils", label: "Nuxt Test Utils" },
    // Community modules
    { name: "@pinia/nuxt", pattern: "@pinia/nuxt", label: "Pinia state management" },
    { name: "nuxt-auth-utils", pattern: "nuxt-auth-utils", label: "Nuxt Auth Utils (session authentication)" },
    { name: "@sidebase/nuxt-auth", pattern: "@sidebase/nuxt-auth", label: "Sidebase Auth (OAuth/credentials)" },
    { name: "@nuxtjs/i18n", pattern: "@nuxtjs/i18n", label: "Nuxt i18n (internationalization)" },
    { name: "@nuxtjs/color-mode", pattern: "@nuxtjs/color-mode", label: "Color mode (dark/light theme)" },
    { name: "@vueuse/nuxt", pattern: "@vueuse/nuxt", label: "VueUse composables" },
    { name: "@nuxtjs/tailwindcss", pattern: "@nuxtjs/tailwindcss", label: "Tailwind CSS integration" },
    { name: "nuxt-icon", pattern: "nuxt-icon", label: "Nuxt Icon (icon component)" },
  ];

  for (const dep of depChecks) {
    if (deps[dep.pattern] || keyDeps[dep.pattern]) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  enrichment.patterns.push({ check: "Nuxt detected", label: "File-based routing (pages/ directory)" });
  enrichment.patterns.push({ check: "Auto-imports", label: "Auto-imports for components, composables, and utils (no manual imports)" });
  enrichment.patterns.push({ check: "Nitro server", label: "Nitro server engine (API routes in server/api/)" });

  if (deps["@pinia/nuxt"] || deps["pinia"]) {
    enrichment.patterns.push({ check: "Pinia", label: "Pinia state management (stores/ directory)" });
  }

  if (deps["@nuxt/content"]) {
    enrichment.patterns.push({ check: "Nuxt Content", label: "Content-driven site (Markdown/YAML in content/)" });
  }

  if (existsSync(join(rootDir, "server/api"))) {
    enrichment.patterns.push({ check: "Server API routes", label: "Server-side API routes (server/api/ auto-registered)" });
  }

  if (existsSync(join(rootDir, "middleware"))) {
    enrichment.patterns.push({ check: "Route middleware", label: "Route middleware (navigation guards)" });
  }

  if (existsSync(join(rootDir, "layers"))) {
    enrichment.patterns.push({ check: "Nuxt layers", label: "Nuxt layers (shared configuration extends)" });
  }

  const nuxtConfig = readSafe(join(rootDir, "nuxt.config.ts")) ?? readSafe(join(rootDir, "nuxt.config.js")) ?? "";
  if (nuxtConfig.includes("ssr: false") || nuxtConfig.includes("ssr:false")) {
    enrichment.patterns.push({ check: "SPA mode", label: "Single-page application mode (SSR disabled)" });
  }

  // ─── Commands ──────────────────────────────────────────────

  enrichment.commands.push(
    { command: "nuxi dev", description: "Start Nuxt development server with HMR", category: "dev" },
    { command: "nuxi build", description: "Build for production (server + client)", category: "build" },
    { command: "nuxi generate", description: "Pre-render static site (SSG)", category: "build" },
    { command: "nuxi preview", description: "Preview production build locally", category: "deploy" },
    { command: "nuxi prepare", description: "Generate TypeScript types and .nuxt/ directory", category: "build" },
    { command: "nuxi typecheck", description: "Run TypeScript type checking", category: "lint" },
    { command: "nuxi cleanup", description: "Clean .nuxt/, .output/, and node_modules/.cache/", category: "other" },
    { command: "nuxi module add <name>", description: "Add a Nuxt module to the project", category: "other" },
  );

  // Testing
  if (deps["@nuxt/test-utils"] || deps["vitest"]) {
    enrichment.commands.push(
      { command: "npx vitest", description: "Run tests with Vitest", category: "test" },
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
    testDir: "tests/ or **/*.test.ts",
    systemTestTools: [],
  };

  if (deps["@nuxt/test-utils"]) {
    enrichment.testing.systemTestTools!.push("@nuxt/test-utils (Nuxt-aware testing)");
  }
  if (deps["@vue/test-utils"]) {
    enrichment.testing.systemTestTools!.push("@vue/test-utils (component testing)");
  }
  if (deps["playwright"] || deps["@playwright/test"]) {
    enrichment.testing.systemTestTools!.push("Playwright (E2E browser testing)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T import from #imports manually — composables and utils are auto-imported",
      reason: "Nuxt auto-imports Vue APIs (ref, computed), composables from composables/, and utils from utils/. Manual imports from #imports are unnecessary and can cause issues during build",
      severity: "critical",
    },
    {
      rule: "DON'T modify .nuxt/ or .output/ directories",
      reason: "These are generated build artifacts. .nuxt/ is recreated on dev/build and .output/ is the production build output. Run `nuxi prepare` to regenerate types",
      severity: "critical",
    },
    {
      rule: "Server routes in server/api/ are auto-registered — DON'T manually register them",
      reason: "Nitro automatically maps files in server/api/ to API endpoints. server/api/users.get.ts becomes GET /api/users. No router configuration needed",
      severity: "important",
    },
    {
      rule: "DON'T use window/document in setup without checking client-side context",
      reason: "Nuxt runs setup() on both server and client by default. Use `if (import.meta.client)` or the `<ClientOnly>` component for browser-only code",
      severity: "critical",
    },
    {
      rule: "DON'T use reactive state outside of composables or components",
      reason: "Reactive state in module-level variables persists across requests on the server, causing data leaks between users. Use useState() or Pinia stores instead",
      severity: "critical",
    },
    {
      rule: "ALWAYS use useFetch/useAsyncData for data fetching in pages/components",
      reason: "useFetch and useAsyncData deduplicate requests, handle SSR/client hydration, and prevent waterfalls. Don't use raw $fetch in components — it runs on both server and client",
      severity: "important",
    },
  );

  return enrichment;
}
