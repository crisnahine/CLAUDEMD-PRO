/**
 * File Scanner
 *
 * Categorizes all project files by functional role (components, models,
 * tests, config, etc.) using a priority-ordered rule chain. Used by the
 * MCP `claudemd_scan_files` tool to give Claude structured file metadata
 * for deeper multi-phase analysis.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Framework } from "./stack-detector.js";

// ─── Types ──────────────────────────────────────────────────

export interface FileCategory {
  files: string[];
  count: number;
}

export interface FileScanResult {
  totalFiles: number;
  categories: Record<string, FileCategory>;
  uncategorized: string[];
  truncated: boolean;
}

// ─── Ignore / Limits ────────────────────────────────────────

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "__pycache__",
  ".bundle",
  "vendor",
  "tmp",
  "log",
  "coverage",
  "dist",
  "build",
  ".cache",
  ".turbo",
  ".nuxt",
  ".svelte-kit",
  "target",
]);

const MAX_DEPTH = 8;
const FILE_CAP = 10_000;

// ─── Directory-name rules (strongest signal) ────────────────

const DIR_CATEGORY: Record<string, string> = {
  components: "components",
  hooks: "hooks",
  services: "services",
  models: "models",
  test: "tests",
  tests: "tests",
  spec: "tests",
  specs: "tests",
  __tests__: "tests",
  config: "config",
  configs: "config",
  utils: "utilities",
  utilities: "utilities",
  helpers: "utilities",
  lib: "utilities",
  middleware: "middleware",
  middlewares: "middleware",
  types: "types",
  typings: "types",
  styles: "styles",
  css: "styles",
  scss: "styles",
  migrations: "migrations",
  migrate: "migrations",
  routes: "routes",
  routing: "routes",
  templates: "templates",
  views: "views",
  controllers: "controllers",
  schemas: "schemas",
  api: "routes",
  pages: "pages",
  layouts: "pages",
  scripts: "scripts",
  docs: "docs",
  fixtures: "fixtures",
  factories: "fixtures",
  seeders: "fixtures",
  seeds: "fixtures",
  jobs: "services",
  workers: "services",
  mailers: "services",
  providers: "config",
  public: "static",
  static: "static",
  assets: "static",
};

// ─── File naming rules ──────────────────────────────────────

function categorizeByFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase();

  // Test files
  if (/\.(test|spec)\.[^.]+$/.test(lower)) return "tests";
  if (/^test_/.test(lower)) return "tests";
  if (/^conftest\.py$/.test(lower)) return "tests";

  // Config files
  if (/\.(config|rc)\.[^.]+$/.test(lower)) return "config";
  if (/^\.[^.]+rc$/.test(lower)) return "config";
  if (/^(tsconfig|jsconfig|babel\.config|webpack\.config|vite\.config|jest\.config|vitest\.config|tailwind\.config|postcss\.config|next\.config|nuxt\.config|svelte\.config|astro\.config)/.test(lower)) return "config";
  if (/^(Makefile|Dockerfile|docker-compose|Procfile|Rakefile|Taskfile)/.test(fileName)) return "config";

  // Type definition files
  if (/\.d\.ts$/.test(lower)) return "types";

  // Style files
  if (/\.(css|scss|sass|less|styl)$/.test(lower)) return "styles";

  // Script files
  if (/\.sh$/.test(lower)) return "scripts";

  // Documentation
  if (/\.md$/.test(lower)) return "docs";

  // Migration files (numbered prefix pattern)
  if (/^\d{14}_/.test(lower)) return "migrations";

  return null;
}

// ─── Framework-aware rules ──────────────────────────────────

interface FrameworkRule {
  pattern: RegExp;
  category: string;
}

const FRAMEWORK_RULES: Partial<Record<Framework, FrameworkRule[]>> = {
  rails: [
    { pattern: /^app\/policies\//, category: "middleware" },
    { pattern: /^app\/serializers\//, category: "schemas" },
    { pattern: /^app\/jobs\//, category: "services" },
    { pattern: /^app\/mailers\//, category: "services" },
    { pattern: /^app\/forms\//, category: "schemas" },
    { pattern: /^app\/components\//, category: "components" },
  ],
  nextjs: [
    { pattern: /\/page\.[^.]+$/, category: "pages" },
    { pattern: /\/layout\.[^.]+$/, category: "pages" },
    { pattern: /\/loading\.[^.]+$/, category: "pages" },
    { pattern: /\/error\.[^.]+$/, category: "pages" },
    { pattern: /\/route\.[^.]+$/, category: "routes" },
  ],
  django: [
    { pattern: /\/urls\.py$/, category: "routes" },
    { pattern: /\/views\.py$/, category: "services" },
    { pattern: /\/forms\.py$/, category: "schemas" },
    { pattern: /\/admin\.py$/, category: "config" },
    { pattern: /\/serializers\.py$/, category: "schemas" },
  ],
  spring: [
    { pattern: /Controller\.java$/, category: "routes" },
    { pattern: /Service\.java$/, category: "services" },
    { pattern: /Repository\.java$/, category: "models" },
    { pattern: /Entity\.java$/, category: "models" },
    { pattern: /Config\.java$/, category: "config" },
  ],
  fastapi: [
    { pattern: /\/schemas\/[^/]+\.py$/, category: "schemas" },
    { pattern: /\/api\/[^/]+\.py$/, category: "routes" },
    { pattern: /\/crud\/[^/]+\.py$/, category: "services" },
  ],
  laravel: [
    { pattern: /app\/Http\/Requests\//, category: "schemas" },
    { pattern: /app\/Providers\//, category: "config" },
    { pattern: /app\/Policies\//, category: "middleware" },
    { pattern: /app\/Events\//, category: "services" },
    { pattern: /app\/Listeners\//, category: "services" },
  ],
};

// ─── .gitignore parser ──────────────────────────────────────

function loadGitignorePatterns(rootDir: string): string[] {
  const gitignorePath = join(rootDir, ".gitignore");
  if (!existsSync(gitignorePath)) return [];
  try {
    const content = readFileSync(gitignorePath, "utf-8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"));
  } catch {
    return [];
  }
}

function isGitignored(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const clean = pattern.replace(/\/$/, "");
    // Simple prefix match — covers most .gitignore usage
    if (relPath === clean || relPath.startsWith(clean + "/")) return true;
    // Glob-style match for **/dir patterns
    if (pattern.startsWith("**/")) {
      const suffix = pattern.slice(3).replace(/\/$/, "");
      const parts = relPath.split("/");
      if (parts.some((p) => p === suffix)) return true;
    }
  }
  return false;
}

// ─── Recursive walk ─────────────────────────────────────────

function walkDir(
  rootDir: string,
  dir: string,
  depth: number,
  excludeSet: Set<string>,
  gitignorePatterns: string[],
  files: string[],
  cap: number
): boolean {
  if (depth > MAX_DEPTH || files.length >= cap) return files.length >= cap;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (files.length >= cap) return true;

    if (entry.name.startsWith(".") && entry.isDirectory()) continue;
    if (excludeSet.has(entry.name) && entry.isDirectory()) continue;

    const fullPath = join(dir, entry.name);
    const relPath = fullPath.slice(rootDir.length + 1);

    if (isGitignored(relPath, gitignorePatterns)) continue;

    if (entry.isFile()) {
      files.push(relPath);
    } else if (entry.isDirectory()) {
      const truncated = walkDir(
        rootDir,
        fullPath,
        depth + 1,
        excludeSet,
        gitignorePatterns,
        files,
        cap
      );
      if (truncated) return true;
    }
  }

  return false;
}

// ─── Main export ────────────────────────────────────────────

export function scanFiles(
  rootDir: string,
  exclude?: string[],
  frameworkHint?: Framework
): FileScanResult {
  const excludeSet = new Set([
    ...IGNORE_DIRS,
    ...(exclude ?? []).map((e) => e.replace(/\/$/, "")),
  ]);
  const gitignorePatterns = loadGitignorePatterns(rootDir);

  // Collect all files
  const allFiles: string[] = [];
  const truncated = walkDir(
    rootDir,
    rootDir,
    0,
    excludeSet,
    gitignorePatterns,
    allFiles,
    FILE_CAP
  );

  // Categorize
  const categories: Record<string, string[]> = {};
  const uncategorized: string[] = [];
  const frameworkRules = frameworkHint
    ? FRAMEWORK_RULES[frameworkHint] ?? []
    : [];

  for (const file of allFiles) {
    const category = classifyFile(file, frameworkRules);
    if (category) {
      if (!categories[category]) categories[category] = [];
      categories[category].push(file);
    } else {
      uncategorized.push(file);
    }
  }

  // Build result
  const result: Record<string, FileCategory> = {};
  for (const [cat, files] of Object.entries(categories)) {
    result[cat] = { files, count: files.length };
  }

  return {
    totalFiles: allFiles.length,
    categories: result,
    uncategorized,
    truncated,
  };
}

function classifyFile(
  relPath: string,
  frameworkRules: FrameworkRule[]
): string | null {
  const parts = relPath.split("/");

  // 1. Directory name (strongest signal — first match wins)
  for (const part of parts.slice(0, -1)) {
    const cat = DIR_CATEGORY[part.toLowerCase()];
    if (cat) return cat;
  }

  // 2. File naming convention
  const fileName = parts[parts.length - 1];
  const fileCategory = categorizeByFileName(fileName);
  if (fileCategory) return fileCategory;

  // 3. Framework-aware context (catches framework-specific paths not covered above)
  for (const rule of frameworkRules) {
    if (rule.pattern.test(relPath)) return rule.category;
  }

  return null;
}
