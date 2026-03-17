import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LintRule, LintContext, LintResult } from "../types.js";

interface FrameworkMatch {
  name: string;
  statedMajor: number;
  index: number;
}

const FRAMEWORK_PATTERNS: { regex: RegExp; name: string; depKey: string }[] = [
  { regex: /\bNext\.?js\s+(\d+)/gi, name: "next", depKey: "next" },
  { regex: /\bReact\s+(\d+)/gi, name: "react", depKey: "react" },
  { regex: /\bVue\.?js?\s+(\d+)/gi, name: "vue", depKey: "vue" },
  { regex: /\bAngular\s+(\d+)/gi, name: "angular", depKey: "@angular/core" },
  { regex: /\bSvelte(?:Kit)?\s+(\d+)/gi, name: "svelte", depKey: "svelte" },
  { regex: /\bNuxt\.?js?\s+(\d+)/gi, name: "nuxt", depKey: "nuxt" },
  { regex: /\bExpress\s+(\d+)/gi, name: "express", depKey: "express" },
  { regex: /\bNest\.?JS?\s+(\d+)/gi, name: "nestjs", depKey: "@nestjs/core" },
];

const PYTHON_PATTERNS: { regex: RegExp; name: string; depKey: string }[] = [
  { regex: /\bDjango\s+(\d+)/gi, name: "django", depKey: "django" },
  { regex: /\bFastAPI\s+(\d+)/gi, name: "fastapi", depKey: "fastapi" },
  { regex: /\bFlask\s+(\d+)/gi, name: "flask", depKey: "flask" },
];

const PHP_PATTERNS: { regex: RegExp; name: string; depKey: string }[] = [
  { regex: /\bLaravel\s+(\d+)/gi, name: "laravel", depKey: "laravel/framework" },
  { regex: /\bSymfony\s+(\d+)/gi, name: "symfony", depKey: "symfony/framework-bundle" },
];

const RUBY_PATTERNS: { regex: RegExp; name: string }[] = [
  { regex: /\bRails\s+(\d+)/gi, name: "rails" },
];

function extractStatedVersions(content: string, patterns: { regex: RegExp; name: string }[]): FrameworkMatch[] {
  const matches: FrameworkMatch[] = [];
  for (const { regex, name } of patterns) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(content)) !== null) {
      matches.push({ name, statedMajor: parseInt(m[1], 10), index: m.index });
    }
  }
  return matches;
}

function getMajorFromSemver(version: string): number | null {
  const cleaned = version.replace(/^[^0-9]*/, "");
  const major = parseInt(cleaned.split(".")[0], 10);
  return isNaN(major) ? null : major;
}

function readJsonSafe(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function checkJsDeps(rootDir: string, depKey: string): number | null {
  const pkg = readJsonSafe(resolve(rootDir, "package.json")) as Record<string, Record<string, string>> | null;
  if (!pkg) return null;
  const version =
    pkg.dependencies?.[depKey] ?? pkg.devDependencies?.[depKey] ?? null;
  if (!version) return null;
  return getMajorFromSemver(version);
}

function checkPythonDeps(rootDir: string, depKey: string): number | null {
  // Check requirements.txt
  const reqPath = resolve(rootDir, "requirements.txt");
  if (existsSync(reqPath)) {
    const content = readFileSync(reqPath, "utf-8");
    const pattern = new RegExp(`^${depKey}[=~><]+([0-9][^\\s]*)`, "im");
    const m = content.match(pattern);
    if (m) return getMajorFromSemver(m[1]);
  }

  // Check pyproject.toml
  const pyprojectPath = resolve(rootDir, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    const content = readFileSync(pyprojectPath, "utf-8");
    const pattern = new RegExp(`"${depKey}[><=~!]*([0-9][^"]*)"`, "i");
    const m = content.match(pattern);
    if (m) return getMajorFromSemver(m[1]);
  }

  return null;
}

function checkPhpDeps(rootDir: string, depKey: string): number | null {
  const composerPath = resolve(rootDir, "composer.json");
  const composer = readJsonSafe(composerPath) as Record<string, Record<string, string>> | null;
  if (!composer) return null;
  const version = composer.require?.[depKey] ?? null;
  if (!version) return null;
  return getMajorFromSemver(version);
}

function checkRubyRails(rootDir: string): number | null {
  const gemfilePath = resolve(rootDir, "Gemfile");
  if (!existsSync(gemfilePath)) return null;
  const content = readFileSync(gemfilePath, "utf-8");
  const m = content.match(/gem\s+['"]rails['"].*?['"]([~>=<]*\s*[0-9][^'"]*)['"]/i);
  if (!m) return null;
  return getMajorFromSemver(m[1]);
}

export const frameworkVersionSyncRule: LintRule = {
  id: "framework-version-sync",
  severity: "warning",
  description: "Checks if stated framework version matches the actual installed version",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];

    // JS frameworks
    for (const stated of extractStatedVersions(ctx.content, FRAMEWORK_PATTERNS)) {
      const fp = FRAMEWORK_PATTERNS.find((p) => p.name === stated.name)!;
      const actual = checkJsDeps(ctx.rootDir, fp.depKey);
      if (actual !== null && actual !== stated.statedMajor) {
        const lineNum = ctx.content.substring(0, stated.index).split("\n").length;
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `CLAUDE.md says ${fp.name} ${stated.statedMajor} but package.json has major version ${actual}.`,
          line: lineNum,
          fix: `Update the version reference to match the installed major version (${actual}).`,
        });
      }
    }

    // Python frameworks
    for (const stated of extractStatedVersions(ctx.content, PYTHON_PATTERNS)) {
      const fp = PYTHON_PATTERNS.find((p) => p.name === stated.name)!;
      const actual = checkPythonDeps(ctx.rootDir, fp.depKey);
      if (actual !== null && actual !== stated.statedMajor) {
        const lineNum = ctx.content.substring(0, stated.index).split("\n").length;
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `CLAUDE.md says ${fp.name} ${stated.statedMajor} but manifest has major version ${actual}.`,
          line: lineNum,
          fix: `Update the version reference to match the installed major version (${actual}).`,
        });
      }
    }

    // PHP frameworks
    for (const stated of extractStatedVersions(ctx.content, PHP_PATTERNS)) {
      const fp = PHP_PATTERNS.find((p) => p.name === stated.name)!;
      const actual = checkPhpDeps(ctx.rootDir, fp.depKey);
      if (actual !== null && actual !== stated.statedMajor) {
        const lineNum = ctx.content.substring(0, stated.index).split("\n").length;
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `CLAUDE.md says ${fp.name} ${stated.statedMajor} but composer.json has major version ${actual}.`,
          line: lineNum,
          fix: `Update the version reference to match the installed major version (${actual}).`,
        });
      }
    }

    // Ruby/Rails
    for (const stated of extractStatedVersions(ctx.content, RUBY_PATTERNS)) {
      const actual = checkRubyRails(ctx.rootDir);
      if (actual !== null && actual !== stated.statedMajor) {
        const lineNum = ctx.content.substring(0, stated.index).split("\n").length;
        results.push({
          ruleId: this.id,
          severity: "warning",
          message: `CLAUDE.md says Rails ${stated.statedMajor} but Gemfile has major version ${actual}.`,
          line: lineNum,
          fix: `Update the version reference to match the installed major version (${actual}).`,
        });
      }
    }

    return results;
  },
};
