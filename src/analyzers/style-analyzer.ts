/**
 * Style Analyzer (Phase 5)
 *
 * Extracts project-specific coding conventions by sampling real source
 * files. Focuses on patterns unique to this codebase, not generic
 * best practices.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import type { StackProfile } from "./stack-detector.js";
import { scanFiles, type FileScanResult } from "./file-scanner.js";

// ─── Types ──────────────────────────────────────────────────

export interface Convention {
  category: string;
  pattern: string;
  example?: string;
}

export interface StyleProfile {
  conventions: Convention[];
  namingStyle: string | null;
  importStyle: string | null;
  exportStyle: string | null;
}

// ─── Safe file read ─────────────────────────────────────────

function readSafe(path: string, maxLines = 100): string | null {
  try {
    if (!existsSync(path)) return null;
    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n");
    return lines.slice(0, maxLines).join("\n");
  } catch {
    return null;
  }
}

// ─── Naming convention detection ────────────────────────────

function detectNamingConvention(files: string[]): string | null {
  let camelCase = 0;
  let kebabCase = 0;
  let snakeCase = 0;
  let pascalCase = 0;

  for (const file of files) {
    const name = file.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
    if (!name || name.startsWith(".")) continue;

    if (/^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) camelCase++;
    else if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name)) kebabCase++;
    else if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name)) snakeCase++;
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) pascalCase++;
  }

  const max = Math.max(camelCase, kebabCase, snakeCase, pascalCase);
  if (max === 0) return null;
  if (max === camelCase) return "camelCase";
  if (max === kebabCase) return "kebab-case";
  if (max === snakeCase) return "snake_case";
  return "PascalCase";
}

// ─── Import style detection ─────────────────────────────────

function detectImportStyle(contents: string[]): string | null {
  let namedImports = 0;
  let defaultImports = 0;
  let barrelImports = 0;
  let relativeImports = 0;
  let aliasImports = 0;

  for (const content of contents) {
    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.trimStart().startsWith("import")) continue;

      if (/import\s+\{/.test(line)) namedImports++;
      if (/import\s+\w+\s+from/.test(line) && !/import\s+\{/.test(line)) defaultImports++;
      if (/from\s+['"]\.\/index/.test(line) || /from\s+['"]\.\.\/index/.test(line)) barrelImports++;
      if (/from\s+['"]\./.test(line)) relativeImports++;
      if (/from\s+['"]@\//.test(line) || /from\s+['"]~\//.test(line)) aliasImports++;
    }
  }

  const patterns: string[] = [];
  if (namedImports > defaultImports * 2) patterns.push("named imports preferred");
  else if (defaultImports > namedImports * 2) patterns.push("default imports preferred");
  if (aliasImports > relativeImports * 0.3) patterns.push("path aliases (@/ or ~/)")
  if (barrelImports > 3) patterns.push("barrel files (index.ts re-exports)");

  return patterns.length > 0 ? patterns.join(", ") : null;
}

// ─── Export style detection ─────────────────────────────────

function detectExportStyle(contents: string[]): string | null {
  let namedExports = 0;
  let defaultExports = 0;

  for (const content of contents) {
    const lines = content.split("\n");
    for (const line of lines) {
      if (/^export\s+(?:function|const|class|interface|type|enum)/.test(line.trim())) namedExports++;
      if (/^export\s+default/.test(line.trim())) defaultExports++;
    }
  }

  if (namedExports === 0 && defaultExports === 0) return null;
  if (namedExports > defaultExports * 3) return "named exports (no default)";
  if (defaultExports > namedExports * 3) return "default exports preferred";
  return "mixed (named + default exports)";
}

// ─── Pattern extraction from source ─────────────────────────

function extractConventions(
  contents: Map<string, string>,
  stack: StackProfile
): Convention[] {
  const conventions: Convention[] = [];
  const allContent = [...contents.values()].join("\n");

  // ─── Function style ──────────────────────────────────
  const arrowFunctions = (allContent.match(/(?:const|let)\s+\w+\s*=\s*(?:async\s+)?\(/g) ?? []).length;
  const regularFunctions = (allContent.match(/(?:export\s+)?(?:async\s+)?function\s+\w+/g) ?? []).length;

  if (arrowFunctions > regularFunctions * 2 && arrowFunctions > 5) {
    conventions.push({
      category: "Functions",
      pattern: "Arrow functions preferred over function declarations",
    });
  } else if (regularFunctions > arrowFunctions * 2 && regularFunctions > 5) {
    conventions.push({
      category: "Functions",
      pattern: "Function declarations preferred over arrow functions",
    });
  }

  // ─── Error handling ──────────────────────────────────
  const tryCatchCount = (allContent.match(/try\s*\{/g) ?? []).length;
  const catchReturnCount = (allContent.match(/catch\s*\([^)]*\)\s*\{[^}]*return/g) ?? []).length;
  const throwCount = (allContent.match(/throw\s+new\s+\w*Error/g) ?? []).length;

  if (throwCount > 5) {
    const customErrors = allContent.match(/throw\s+new\s+(\w+Error)/g) ?? [];
    const uniqueErrors = [...new Set(customErrors.map((m) => m.match(/new\s+(\w+)/)?.[1]).filter(Boolean))];
    if (uniqueErrors.length > 1 && uniqueErrors.some((e) => e !== "Error")) {
      conventions.push({
        category: "Error handling",
        pattern: `Custom error classes: ${uniqueErrors.slice(0, 4).join(", ")}`,
      });
    }
  }

  // ─── Async patterns ─────────────────────────────────
  const asyncAwait = (allContent.match(/async\s+/g) ?? []).length;
  const thenChains = (allContent.match(/\.then\s*\(/g) ?? []).length;

  if (asyncAwait > 5 && asyncAwait > thenChains * 3) {
    conventions.push({
      category: "Async",
      pattern: "async/await preferred (no .then() chains)",
    });
  }

  // ─── TypeScript specifics ───────────────────────────
  if (stack.language === "typescript") {
    const interfaceCount = (allContent.match(/\binterface\s+\w+/g) ?? []).length;
    const typeCount = (allContent.match(/\btype\s+\w+\s*=/g) ?? []).length;

    if (interfaceCount > typeCount * 2 && interfaceCount > 5) {
      conventions.push({
        category: "TypeScript",
        pattern: "Interfaces preferred over type aliases for object shapes",
      });
    } else if (typeCount > interfaceCount * 2 && typeCount > 5) {
      conventions.push({
        category: "TypeScript",
        pattern: "Type aliases preferred over interfaces",
      });
    }

    // Enum usage
    const enumCount = (allContent.match(/\benum\s+\w+/g) ?? []).length;
    const constObj = (allContent.match(/as\s+const/g) ?? []).length;
    if (constObj > enumCount && constObj > 3) {
      conventions.push({
        category: "TypeScript",
        pattern: "'as const' objects preferred over enums",
      });
    }
  }

  // ─── Ruby/Rails specifics ──────────────────────────
  if (stack.framework === "rails") {
    const scopeCount = (allContent.match(/scope\s+:\w+/g) ?? []).length;
    const concernCount = (allContent.match(/(?:include|extend)\s+\w+(?:able|ible|Concern)/g) ?? []).length;
    const callbackCount = (allContent.match(/(?:before|after|around)_(?:action|create|save|update|destroy)/g) ?? []).length;

    if (scopeCount > 3) {
      conventions.push({ category: "Rails", pattern: "Named scopes for common queries" });
    }
    if (concernCount > 2) {
      conventions.push({ category: "Rails", pattern: "Concerns for shared model/controller behavior" });
    }
    if (callbackCount > 3) {
      conventions.push({ category: "Rails", pattern: "ActiveRecord callbacks for lifecycle hooks" });
    }
  }

  // ─── Python specifics ──────────────────────────────
  if (stack.language === "python") {
    const typeHints = (allContent.match(/def\s+\w+\([^)]*:\s*\w+/g) ?? []).length;
    const decoratorCount = (allContent.match(/^@\w+/gm) ?? []).length;
    const dataclassCount = (allContent.match(/@dataclass/g) ?? []).length;

    if (typeHints > 10) {
      conventions.push({ category: "Python", pattern: "Type hints on function signatures" });
    }
    if (dataclassCount > 2) {
      conventions.push({ category: "Python", pattern: "@dataclass for data structures" });
    }
    if (decoratorCount > 5) {
      conventions.push({ category: "Python", pattern: "Heavy use of decorators" });
    }
  }

  // ─── Go specifics ─────────────────────────────────
  if (stack.language === "go") {
    const interfaceCount = (allContent.match(/type\s+\w+\s+interface/g) ?? []).length;
    const errorCheck = (allContent.match(/if\s+err\s*!=\s*nil/g) ?? []).length;
    const contextParam = (allContent.match(/ctx\s+context\.Context/g) ?? []).length;

    if (interfaceCount > 3) {
      conventions.push({ category: "Go", pattern: "Interface-driven design" });
    }
    if (contextParam > 5) {
      conventions.push({ category: "Go", pattern: "context.Context as first parameter" });
    }
  }

  // ─── Test patterns ─────────────────────────────────
  const describeBlocks = (allContent.match(/describe\s*\(/g) ?? []).length;
  const itBlocks = (allContent.match(/\bit\s*\(/g) ?? []).length;
  const testBlocks = (allContent.match(/\btest\s*\(/g) ?? []).length;
  const factoryPattern = (allContent.match(/(?:create|build)(?:Factory|Fixture|Mock)\s*\(/g) ?? []).length;

  if (describeBlocks > 3 && itBlocks > 3) {
    conventions.push({ category: "Testing", pattern: "describe/it block structure" });
  } else if (testBlocks > 5) {
    conventions.push({ category: "Testing", pattern: "Flat test() blocks" });
  }
  if (factoryPattern > 3) {
    conventions.push({ category: "Testing", pattern: "Factory/fixture helpers for test data" });
  }

  // ─── API response shape ────────────────────────────
  const dataResponse = (allContent.match(/\{\s*data\s*[:,]/g) ?? []).length;
  const errorResponse = (allContent.match(/\{\s*error\s*[:,]/g) ?? []).length;
  if (dataResponse > 3 && errorResponse > 2) {
    conventions.push({
      category: "API",
      pattern: "Responses use { data, error } shape",
    });
  }

  return conventions;
}

// ─── Main export ────────────────────────────────────────────

export async function analyzeStyle(
  rootDir: string,
  stack: StackProfile,
  scan?: FileScanResult
): Promise<StyleProfile> {
  const fileScan = scan ?? scanFiles(rootDir, undefined, stack.framework);

  // Sample source files from key categories
  const sampleCategories = ["components", "services", "models", "routes", "controllers", "utilities"];
  const sampled: string[] = [];

  for (const cat of sampleCategories) {
    const files = fileScan.categories[cat]?.files ?? [];
    // Take up to 5 files per category
    sampled.push(...files.slice(0, 5));
  }

  // Also sample uncategorized source files
  const sourceExts = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go", ".rs", ".java", ".php", ".ex"]);
  const uncategorizedSource = fileScan.uncategorized
    .filter((f) => sourceExts.has(extname(f)))
    .slice(0, 10);
  sampled.push(...uncategorizedSource);

  // Read sampled files
  const contents = new Map<string, string>();
  for (const file of sampled.slice(0, 40)) {
    const content = readSafe(join(rootDir, file));
    if (content && content.length > 10) {
      contents.set(file, content);
    }
  }

  // Also read test files for test convention detection
  const testFiles = (fileScan.categories.tests?.files ?? []).slice(0, 10);
  for (const file of testFiles) {
    const content = readSafe(join(rootDir, file));
    if (content && content.length > 10) {
      contents.set(file, content);
    }
  }

  // Detect naming
  const allSourceFiles = [
    ...Object.values(fileScan.categories).flatMap((c) => c.files),
  ].filter((f) => sourceExts.has(extname(f)));
  const namingStyle = detectNamingConvention(allSourceFiles);

  // Detect import/export style (JS/TS only)
  let importStyle: string | null = null;
  let exportStyle: string | null = null;

  if (stack.language === "typescript" || stack.language === "javascript") {
    const jsContents = [...contents.entries()]
      .filter(([f]) => /\.[tj]sx?$/.test(f))
      .map(([, c]) => c);
    importStyle = detectImportStyle(jsContents);
    exportStyle = detectExportStyle(jsContents);
  }

  // Extract conventions
  const conventions = extractConventions(contents, stack);

  // Add naming convention
  if (namingStyle) {
    conventions.unshift({
      category: "Naming",
      pattern: `File naming: ${namingStyle}`,
    });
  }

  // Add import/export conventions
  if (importStyle) {
    conventions.push({ category: "Imports", pattern: importStyle });
  }
  if (exportStyle) {
    conventions.push({ category: "Exports", pattern: exportStyle });
  }

  return {
    conventions,
    namingStyle,
    importStyle,
    exportStyle,
  };
}
