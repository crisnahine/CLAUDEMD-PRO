/**
 * Stack Detector
 *
 * Identifies the primary language, framework, and runtime by reading
 * manifest files (package.json, Gemfile, requirements.txt, etc.).
 * This is the first analyzer to run — everything else depends on it.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────

export type Language =
  | "ruby"
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "elixir"
  | "php"
  | "rust"
  | "java"
  | "dart"
  | "kotlin"
  | "swift"
  | "csharp"
  | "unknown";

export type Framework =
  | "rails"
  | "nextjs"
  | "remix"
  | "nestjs"
  | "nuxt"
  | "sveltekit"
  | "svelte"
  | "astro"
  | "hono"
  | "elysia"
  | "express"
  | "fastify"
  | "django"
  | "flask"
  | "fastapi"
  | "laravel"
  | "phoenix"
  | "gin"
  | "echo"
  | "fiber"
  | "spring"
  | "ktor"
  | "actix"
  | "axum"
  | "rocket"
  | "flutter"
  | "vapor"
  | "dotnet"
  | "fresh"
  | "unknown";

export interface StackProfile {
  language: Language;
  framework: Framework;
  languageVersion: string | null;
  runtimeVersion: string | null;
  frameworkVersion: string | null;
  runtime: string | null; // node, bun, deno, ruby, python, etc.
  packageManager: string | null; // npm, yarn, pnpm, bundler, pip, etc.
  monorepo: boolean;
  /** Raw key dependencies (name → version) for framework-specific analyzers */
  keyDeps: Record<string, string>;
}

// ─── Manifest readers ───────────────────────────────────────

function readJson(filePath: string): Record<string, any> | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function readText(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function fileExists(root: string, ...segments: string[]): boolean {
  return existsSync(join(root, ...segments));
}

// ─── Detection logic ────────────────────────────────────────

/**
 * Detects the full stack profile for a project directory.
 * `forceFramework` overrides auto-detection (from --framework flag).
 */
export async function detectStack(
  rootDir: string,
  forceFramework?: string
): Promise<StackProfile> {
  const profile: StackProfile = {
    language: "unknown",
    framework: "unknown",
    languageVersion: null,
    runtimeVersion: null,
    frameworkVersion: null,
    runtime: null,
    packageManager: null,
    monorepo: false,
    keyDeps: {},
  };

  // ── Monorepo signals ──
  profile.monorepo =
    fileExists(rootDir, "pnpm-workspace.yaml") ||
    fileExists(rootDir, "lerna.json") ||
    fileExists(rootDir, "nx.json") ||
    (readJson(join(rootDir, "package.json"))?.workspaces != null);

  // ── Ruby / Rails ──
  const gemfile = readText(join(rootDir, "Gemfile"));
  if (gemfile) {
    profile.language = "ruby";
    profile.packageManager = "bundler";

    // Extract Ruby version
    const rubyVersionFile = readText(join(rootDir, ".ruby-version"));
    profile.languageVersion = rubyVersionFile?.trim() ?? null;
    profile.runtimeVersion = profile.languageVersion;

    // Parse key gems
    const gemPattern = /gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/g;
    let match;
    while ((match = gemPattern.exec(gemfile)) !== null) {
      profile.keyDeps[match[1]] = match[2] ?? "*";
    }

    if (profile.keyDeps["rails"]) {
      profile.framework = "rails";
      profile.frameworkVersion = profile.keyDeps["rails"];
      profile.runtime = "ruby";
    }
  }

  // ── Deno (native, not via package.json) ──
  const denoJson = readJson(join(rootDir, "deno.json")) ?? readJson(join(rootDir, "deno.jsonc"));
  if (denoJson && !fileExists(rootDir, "package.json") && profile.language === "unknown") {
    profile.language = "typescript";
    profile.runtime = "deno";
    profile.packageManager = "deno";
    // Parse imports as deps
    if (denoJson.imports) {
      for (const [name, url] of Object.entries(denoJson.imports as Record<string, string>)) {
        profile.keyDeps[name.replace(/\/$/, "")] = url;
      }
    }
    // Detect Fresh framework
    if (denoJson.imports?.["$fresh/"] || denoJson.imports?.["fresh"]) {
      profile.framework = "fresh";
    }
  }

  // ── JavaScript / TypeScript ──
  const pkgJson = readJson(join(rootDir, "package.json"));
  if (pkgJson && profile.language === "unknown") {
    const allDeps = {
      ...(pkgJson.dependencies ?? {}),
      ...(pkgJson.devDependencies ?? {}),
    };
    profile.keyDeps = { ...profile.keyDeps, ...allDeps };

    // Language: TS if tsconfig exists or typescript in deps
    profile.language =
      fileExists(rootDir, "tsconfig.json") || allDeps["typescript"]
        ? "typescript"
        : "javascript";

    // Runtime
    if (fileExists(rootDir, "bun.lockb") || fileExists(rootDir, "bunfig.toml")) {
      profile.runtime = "bun";
    } else if (fileExists(rootDir, "deno.json") || fileExists(rootDir, "deno.lock")) {
      profile.runtime = "deno";
    } else {
      profile.runtime = "node";
    }

    // Package manager
    if (fileExists(rootDir, "pnpm-lock.yaml")) {
      profile.packageManager = "pnpm";
    } else if (fileExists(rootDir, "yarn.lock")) {
      profile.packageManager = "yarn";
    } else if (fileExists(rootDir, "bun.lockb")) {
      profile.packageManager = "bun";
    } else {
      profile.packageManager = "npm";
    }

    // Runtime (Node) version
    const nvmrc = readText(join(rootDir, ".nvmrc"));
    const nodeVersion = readText(join(rootDir, ".node-version"));
    profile.runtimeVersion =
      nvmrc?.trim() ?? nodeVersion?.trim() ?? pkgJson.engines?.node ?? null;

    // Language version: use TypeScript dep version for TS, Node version for JS
    if (profile.language === "typescript" && allDeps["typescript"]) {
      profile.languageVersion = allDeps["typescript"].replace(/^[\^~>=]+/, "");
    } else {
      profile.languageVersion = profile.runtimeVersion;
    }

    // Framework detection (order matters — most specific first)
    if (allDeps["next"]) {
      profile.framework = "nextjs";
      profile.frameworkVersion = allDeps["next"];
    } else if (allDeps["@remix-run/node"] || allDeps["@remix-run/react"]) {
      profile.framework = "remix";
      profile.frameworkVersion = allDeps["@remix-run/node"] ?? allDeps["@remix-run/react"];
    } else if (allDeps["@nestjs/core"]) {
      profile.framework = "nestjs";
      profile.frameworkVersion = allDeps["@nestjs/core"];
    } else if (allDeps["nuxt"]) {
      profile.framework = "nuxt";
      profile.frameworkVersion = allDeps["nuxt"];
    } else if (allDeps["@sveltejs/kit"]) {
      profile.framework = "sveltekit";
      profile.frameworkVersion = allDeps["@sveltejs/kit"];
    } else if (allDeps["svelte"]) {
      profile.framework = "svelte";
      profile.frameworkVersion = allDeps["svelte"];
    } else if (allDeps["astro"]) {
      profile.framework = "astro";
      profile.frameworkVersion = allDeps["astro"];
    } else if (allDeps["hono"]) {
      profile.framework = "hono";
      profile.frameworkVersion = allDeps["hono"];
    } else if (allDeps["elysia"]) {
      profile.framework = "elysia";
      profile.frameworkVersion = allDeps["elysia"];
    } else if (allDeps["fastify"]) {
      profile.framework = "fastify";
      profile.frameworkVersion = allDeps["fastify"];
    } else if (allDeps["express"]) {
      profile.framework = "express";
      profile.frameworkVersion = allDeps["express"];
    }
  }

  // ── Python ──
  const requirements = readText(join(rootDir, "requirements.txt"));
  const pyproject = readText(join(rootDir, "pyproject.toml"));
  if ((requirements || pyproject) && profile.language === "unknown") {
    profile.language = "python";
    profile.runtime = "python";

    if (fileExists(rootDir, "poetry.lock")) {
      profile.packageManager = "poetry";
    } else if (fileExists(rootDir, "Pipfile")) {
      profile.packageManager = "pipenv";
    } else if (pyproject?.includes("[tool.uv]")) {
      profile.packageManager = "uv";
    } else {
      profile.packageManager = "pip";
    }

    // Extract python version from .python-version or pyproject.toml
    const pyVersion = readText(join(rootDir, ".python-version"));
    profile.languageVersion = pyVersion?.trim() ?? null;
    profile.runtimeVersion = profile.languageVersion;

    // Parse requirements.txt into keyDeps
    if (requirements) {
      for (const line of requirements.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
        const depMatch = trimmed.match(/^([a-zA-Z0-9_-]+)(?:[=<>!~].*)?$/);
        if (depMatch) {
          const version = trimmed.match(/[=<>!~]+(.+)/)?.[1] ?? "*";
          profile.keyDeps[depMatch[1].toLowerCase()] = version;
        }
      }
    }

    // Parse pyproject.toml dependencies
    if (pyproject) {
      const depsSection = pyproject.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
      if (depsSection) {
        for (const line of depsSection[1].split("\n")) {
          const depMatch = line.match(/["']([a-zA-Z0-9_-]+)/);
          if (depMatch) profile.keyDeps[depMatch[1].toLowerCase()] = "*";
        }
      }
    }

    const depsText = requirements ?? pyproject ?? "";
    if (/django/i.test(depsText)) {
      profile.framework = "django";
    } else if (/flask/i.test(depsText)) {
      profile.framework = "flask";
    } else if (/fastapi/i.test(depsText)) {
      profile.framework = "fastapi";
    }
  }

  // ── Go ──
  if (fileExists(rootDir, "go.mod") && profile.language === "unknown") {
    profile.language = "go";
    profile.runtime = "go";
    profile.packageManager = "go modules";

    const goMod = readText(join(rootDir, "go.mod"));
    const goVersion = goMod?.match(/^go\s+(\d+\.\d+)/m);
    profile.languageVersion = goVersion?.[1] ?? null;
    profile.runtimeVersion = profile.languageVersion;

    // Parse Go module dependencies
    if (goMod) {
      const requireBlock = goMod.match(/require\s*\(([\s\S]*?)\)/);
      if (requireBlock) {
        for (const line of requireBlock[1].split("\n")) {
          const depMatch = line.trim().match(/^([\w./\-@]+)\s+([\w.\-]+)/);
          if (depMatch) profile.keyDeps[depMatch[1]] = depMatch[2];
        }
      }
      // Single-line requires
      const singleReqs = goMod.matchAll(/require\s+([\w./\-@]+)\s+([\w.\-]+)/g);
      for (const m of singleReqs) profile.keyDeps[m[1]] = m[2];
    }

    if (goMod?.includes("github.com/gin-gonic/gin")) {
      profile.framework = "gin";
    } else if (goMod?.includes("github.com/labstack/echo")) {
      profile.framework = "echo";
    } else if (goMod?.includes("github.com/gofiber/fiber")) {
      profile.framework = "fiber";
    }
  }

  // ── Rust ──
  if (fileExists(rootDir, "Cargo.toml") && profile.language === "unknown") {
    profile.language = "rust";
    profile.runtime = "rust";
    profile.packageManager = "cargo";

    const cargoToml = readText(join(rootDir, "Cargo.toml"));
    if (cargoToml) {
      const rustVersion = cargoToml.match(/rust-version\s*=\s*"(\d+\.\d+)"/);
      profile.languageVersion = rustVersion?.[1] ?? null;
      profile.runtimeVersion = profile.languageVersion;

      // Parse key deps from [dependencies] section
      // Match until next TOML section header (e.g. [dev-dependencies], [workspace])
      // but NOT brackets inside values like features = ["derive"]
      const depsSection = cargoToml.match(/\[dependencies\]\n([\s\S]*?)(?=\n\[[a-zA-Z]|\s*$)/);
      if (depsSection) {
        for (const line of depsSection[1].split("\n")) {
          const depMatch = line.match(/^(\w[\w-]*)\s*=/);
          if (depMatch) profile.keyDeps[depMatch[1]] = "*";
        }
      }

      if (cargoToml.includes("actix-web")) {
        profile.framework = "actix";
      } else if (cargoToml.includes("axum")) {
        profile.framework = "axum";
      } else if (cargoToml.includes("rocket")) {
        profile.framework = "rocket";
      }
    }
  }

  // ── Java / Spring Boot ──
  if ((fileExists(rootDir, "pom.xml") || fileExists(rootDir, "build.gradle") || fileExists(rootDir, "build.gradle.kts")) && profile.language === "unknown") {
    profile.language = "java";
    profile.runtime = "java";
    profile.packageManager = fileExists(rootDir, "pom.xml") ? "maven" : "gradle";

    const pomXml = readText(join(rootDir, "pom.xml"));
    const buildGradle = readText(join(rootDir, "build.gradle")) ?? readText(join(rootDir, "build.gradle.kts"));

    const javaVersion = readText(join(rootDir, ".java-version"));
    profile.languageVersion = javaVersion?.trim() ?? null;
    profile.runtimeVersion = profile.languageVersion;

    if (pomXml?.includes("spring-boot") || buildGradle?.includes("spring-boot")) {
      profile.framework = "spring";
    }
  }

  // ── PHP / Laravel ──
  if (fileExists(rootDir, "composer.json") && profile.language === "unknown") {
    profile.language = "php";
    profile.runtime = "php";
    profile.packageManager = "composer";

    const composer = readJson(join(rootDir, "composer.json"));
    if (composer?.require?.["laravel/framework"]) {
      profile.framework = "laravel";
      profile.frameworkVersion = composer.require["laravel/framework"];
    }
  }

  // ── Elixir / Phoenix ──
  if (fileExists(rootDir, "mix.exs") && profile.language === "unknown") {
    profile.language = "elixir";
    profile.runtime = "elixir";
    profile.packageManager = "hex";

    const mixExs = readText(join(rootDir, "mix.exs"));
    if (mixExs?.includes(":phoenix")) {
      profile.framework = "phoenix";
    }
  }

  // ── C# / .NET ──
  if (profile.language === "unknown") {
    try {
      const entries = readdirSync(rootDir);
      const csprojFile = entries.find(e => e.endsWith('.csproj'));
      if (csprojFile) {
        profile.language = "csharp";
        profile.runtime = "dotnet";
        profile.packageManager = "nuget";
        // Read .csproj for target framework and package references
        const csproj = readText(join(rootDir, csprojFile));
        if (csproj) {
          const tfm = csproj.match(/<TargetFramework>(net\d+\.?\d*)<\/TargetFramework>/);
          profile.languageVersion = tfm?.[1] ?? null;
          profile.runtimeVersion = profile.languageVersion;
          // Parse PackageReference deps
          const pkgRefs = csproj.matchAll(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g);
          for (const m of pkgRefs) profile.keyDeps[m[1]] = m[2];
          if (csproj.includes("Microsoft.AspNetCore") || csproj.includes("Microsoft.NET.Sdk.Web")) {
            profile.framework = "dotnet";
          }
        }
      }
    } catch { /* ignore */ }
  }

  // ── Kotlin (upgrade from Java or detect fresh) ──
  if (profile.language === "unknown" || (profile.language === "java" && (fileExists(rootDir, "build.gradle.kts") || readText(join(rootDir, "build.gradle"))?.includes("kotlin")))) {
    const buildGradleKts = readText(join(rootDir, "build.gradle.kts"));
    const buildGradle = readText(join(rootDir, "build.gradle"));
    const gradleContent = buildGradleKts ?? buildGradle ?? "";
    if (gradleContent.includes("kotlin") || gradleContent.includes("org.jetbrains.kotlin")) {
      profile.language = "kotlin";
      profile.runtime = "jvm";
      profile.packageManager = "gradle";
      const kotlinVersion = gradleContent.match(/kotlin.*?version\s*[=:]\s*['"](\d+\.\d+\.\d+)['"]/)?.[1] ?? null;
      profile.languageVersion = kotlinVersion;
      profile.runtimeVersion = profile.languageVersion;
      // Parse Gradle dependencies: implementation("group:artifact:version")
      const gradleDeps = gradleContent.matchAll(/(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(\s*"([^"]+)"\s*\)/g);
      for (const m of gradleDeps) {
        const parts = m[1].split(":");
        if (parts.length >= 2) {
          const depKey = `${parts[0]}:${parts[1]}`;
          profile.keyDeps[depKey] = parts[2] ?? "*";
        }
      }
      if (gradleContent.includes("io.ktor")) {
        profile.framework = "ktor";
        const ktorVersion = gradleContent.match(/io\.ktor.*?version\s*[=:]\s*['"](\d+\.\d+\.\d+)['"]/)?.[1] ?? null;
        profile.frameworkVersion = ktorVersion;
      } else if (gradleContent.includes("spring-boot")) {
        profile.framework = "spring";
      }
    }
  }

  // ── Dart / Flutter ──
  if (fileExists(rootDir, "pubspec.yaml") && profile.language === "unknown") {
    profile.language = "dart";
    profile.runtime = "dart";
    profile.packageManager = "pub";
    const pubspec = readText(join(rootDir, "pubspec.yaml"));
    if (pubspec) {
      // Extract SDK version
      const sdkVersion = pubspec.match(/sdk:\s*['"]?>=?(\d+\.\d+\.\d+)/)?.[1] ?? null;
      profile.languageVersion = sdkVersion;
      profile.runtimeVersion = profile.languageVersion;
      // Parse dependencies
      const depsMatch = pubspec.match(/dependencies:\s*\n((?:\s+\S.*\n)*)/);
      if (depsMatch) {
        for (const line of depsMatch[1].split("\n")) {
          const depMatch = line.trim().match(/^(\w[\w_-]*):\s*(.*)/);
          if (depMatch && depMatch[1] !== "sdk") profile.keyDeps[depMatch[1]] = depMatch[2] || "*";
        }
      }
      if (pubspec.includes("flutter:") || pubspec.includes("flutter_test:")) {
        profile.framework = "flutter";
      }
    }
  }

  // ── Swift / Vapor ──
  if (fileExists(rootDir, "Package.swift") && profile.language === "unknown") {
    profile.language = "swift";
    profile.runtime = "swift";
    profile.packageManager = "spm";
    const packageSwift = readText(join(rootDir, "Package.swift"));
    if (packageSwift) {
      const swiftVersion = packageSwift.match(/swift-tools-version:\s*(\d+\.\d+)/)?.[1] ?? null;
      profile.languageVersion = swiftVersion;
      profile.runtimeVersion = profile.languageVersion;
      // Parse package dependencies
      const depPattern = /\.package\s*\(\s*url:\s*"[^"]*\/([^"/]+?)(?:\.git)?"\s*,/g;
      let depMatch;
      while ((depMatch = depPattern.exec(packageSwift)) !== null) {
        profile.keyDeps[depMatch[1]] = "*";
      }
      if (packageSwift.includes("vapor")) {
        profile.framework = "vapor";
      }
    }
  }

  // ── Forced framework override ──
  if (forceFramework) {
    profile.framework = forceFramework as Framework;
  }

  return profile;
}
