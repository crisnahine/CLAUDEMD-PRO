/**
 * Framework Enrichment Router
 *
 * Routes to the correct framework-specific deep analyzer based on the
 * detected framework string from the stack detector. Returns a
 * FrameworkEnrichment object that gets merged into the main pipeline.
 */

import type { FrameworkEnrichment } from "../frameworks/django.js";
import { analyzeDjango } from "../frameworks/django.js";
import { analyzeFastApi } from "../frameworks/fastapi.js";
import { analyzeNestjs } from "../frameworks/nestjs.js";
import { analyzeNuxt } from "../frameworks/nuxt.js";
import { analyzeSvelte } from "../frameworks/svelte.js";
import { analyzeAstro } from "../frameworks/astro.js";
import { analyzeRemix } from "../frameworks/remix.js";
import { analyzeHono } from "../frameworks/hono.js";
import { analyzeGo } from "../frameworks/go.js";
import { analyzeRust } from "../frameworks/rust.js";
import { analyzeSpring } from "../frameworks/spring.js";
import { analyzeLaravel } from "../frameworks/laravel.js";
import { analyzePhoenix } from "../frameworks/phoenix.js";
import { analyzeDotnet } from "../frameworks/dotnet.js";
import { analyzeKotlin } from "../frameworks/kotlin.js";
import { analyzeFlutter } from "../frameworks/flutter.js";
import { analyzeDeno } from "../frameworks/deno.js";
import { analyzeBun } from "../frameworks/bun.js";
import { analyzeSwift } from "../frameworks/swift.js";

export type { FrameworkEnrichment };

/**
 * Route to the correct framework-specific deep analyzer.
 * Returns null for unrecognized or unsupported frameworks.
 */
export function enrichWithFramework(
  rootDir: string,
  framework: string,
  keyDeps: Record<string, string>
): FrameworkEnrichment | null {
  switch (framework) {
    // Python
    case "django":
      return analyzeDjango(rootDir, keyDeps);
    case "flask":
    case "fastapi":
      return analyzeFastApi(rootDir, keyDeps);

    // Node.js / TypeScript
    case "nestjs":
      return analyzeNestjs(rootDir, keyDeps);
    case "nuxt":
      return analyzeNuxt(rootDir, keyDeps);
    case "sveltekit":
    case "svelte":
      return analyzeSvelte(rootDir, keyDeps);
    case "astro":
      return analyzeAstro(rootDir, keyDeps);
    case "remix":
      return analyzeRemix(rootDir, keyDeps);
    case "hono":
      return analyzeHono(rootDir, keyDeps);

    // Go
    case "gin":
    case "echo":
    case "fiber":
      return analyzeGo(rootDir, keyDeps);

    // Rust
    case "actix":
    case "axum":
    case "rocket":
      return analyzeRust(rootDir, keyDeps);

    // JVM
    case "spring":
      return analyzeSpring(rootDir, keyDeps);
    case "ktor":
      return analyzeKotlin(rootDir, keyDeps);

    // PHP
    case "laravel":
      return analyzeLaravel(rootDir, keyDeps);

    // Elixir
    case "phoenix":
      return analyzePhoenix(rootDir, keyDeps);

    // .NET
    case "dotnet":
      return analyzeDotnet(rootDir, keyDeps);

    // Dart
    case "flutter":
      return analyzeFlutter(rootDir, keyDeps);

    // Deno
    case "fresh":
      return analyzeDeno(rootDir, keyDeps);

    // Bun
    case "elysia":
      return analyzeBun(rootDir, keyDeps);

    // Swift
    case "vapor":
      return analyzeSwift(rootDir, keyDeps);

    // Frameworks without deep analyzers (nextjs, rails, express, fastify)
    default:
      return null;
  }
}
