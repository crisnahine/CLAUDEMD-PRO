/**
 * Stack Detector
 *
 * Identifies the primary language, framework, and runtime by reading
 * manifest files (package.json, Gemfile, requirements.txt, etc.).
 * This is the first analyzer to run — everything else depends on it.
 */

import { existsSync, readFileSync } from "node:fs";
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
  | "unknown";

export type Framework =
  | "rails"
  | "nextjs"
  | "remix"
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
  | "actix"
  | "axum"
  | "rocket"
  | "unknown";

export interface StackProfile {
  language: Language;
  framework: Framework;
  languageVersion: string | null;
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

    // Node version
    const nvmrc = readText(join(rootDir, ".nvmrc"));
    const nodeVersion = readText(join(rootDir, ".node-version"));
    profile.languageVersion =
      nvmrc?.trim() ?? nodeVersion?.trim() ?? pkgJson.engines?.node ?? null;

    // Framework detection (order matters — most specific first)
    if (allDeps["next"]) {
      profile.framework = "nextjs";
      profile.frameworkVersion = allDeps["next"];
    } else if (allDeps["@remix-run/node"] || allDeps["@remix-run/react"]) {
      profile.framework = "remix";
      profile.frameworkVersion = allDeps["@remix-run/node"] ?? allDeps["@remix-run/react"];
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

      // Parse key deps from [dependencies] section
      const depsSection = cargoToml.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
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

  // ── Forced framework override ──
  if (forceFramework) {
    profile.framework = forceFramework as Framework;
  }

  return profile;
}
