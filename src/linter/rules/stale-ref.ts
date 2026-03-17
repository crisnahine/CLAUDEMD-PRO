import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { LintRule, LintContext, LintResult } from "../types.js";

/**
 * Known directory prefixes that are almost certainly filesystem references
 * when they appear as leading path segments.
 */
const KNOWN_PREFIXES: ReadonlySet<string> = new Set([
  "src",
  "app",
  "lib",
  "config",
  "test",
  "tests",
  "spec",
  "db",
  "prisma",
  "public",
  "internal",
  "cmd",
  "utils",
  "services",
  "models",
  "helpers",
  "scripts",
  "packages",
  "routes",
  "middleware",
  "api",
  "views",
  "templates",
  "static",
  "assets",
  "components",
  "hooks",
  "stores",
  "pages",
  "resources",
  "migrations",
  "schemas",
  "types",
  "fixtures",
  "factories",
  "vendor",
  "web",
  "docs",
  "tools",
  "deployments",
  "build",
  "dist",
  "proto",
]);

/**
 * Returns the first path segment from a path string.
 * e.g. "/src/foo/bar" -> "src", "components/Button.tsx" -> "components"
 */
function firstSegment(p: string): string {
  const trimmed = p.startsWith("/") ? p.slice(1) : p;
  const idx = trimmed.indexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

/**
 * Heuristic: does this string look like a filesystem path rather than
 * a URL, anchor link, CLI flag, or other non-path reference?
 */
function looksLikeFilesystemPath(raw: string): boolean {
  // Skip URLs
  if (/^https?:\/\//i.test(raw)) return false;

  // Skip anchor links (#section)
  if (raw.startsWith("#")) return false;

  // Skip CLI flags (--something, -x)
  if (/^--?[a-zA-Z]/.test(raw)) return false;

  // Skip semver-like strings (v1.2.3, 1.2.3/foo)
  if (/^v?\d+\.\d+/.test(raw)) return false;

  // Skip things that look like module specifiers with @ scope (@org/pkg)
  if (raw.startsWith("@")) return false;

  // Must contain at least one `/` and have at least 2 non-empty segments
  const segments = raw.replace(/^\//, "").split("/").filter(Boolean);
  if (segments.length < 2) return false;

  // Each segment should look like a filesystem name (alphanumeric, dots, dashes, underscores)
  return segments.every((s) => /^[a-zA-Z0-9_\-][a-zA-Z0-9_\-.]*$/.test(s));
}

/**
 * Build a set of line numbers that fall inside fenced code blocks (``` ... ```).
 * We skip path detection inside code blocks to avoid false positives from
 * code examples, shell output, etc.
 */
function fencedCodeBlockLines(content: string): Set<number> {
  const lines = content.split("\n");
  const result = new Set<number>();
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i].trimStart())) {
      inBlock = !inBlock;
      result.add(i + 1); // 1-indexed
      continue;
    }
    if (inBlock) {
      result.add(i + 1);
    }
  }
  return result;
}

function getLineNumber(content: string, charIndex: number): number {
  return content.substring(0, charIndex).split("\n").length;
}

export const staleRefRule: LintRule = {
  id: "stale-ref",
  severity: "error",
  description: "References to non-existent paths",
  run(ctx: LintContext): LintResult[] {
    const results: LintResult[] = [];
    const codeLines = fencedCodeBlockLines(ctx.content);

    // Track paths we've already reported to avoid duplicate findings
    const reported = new Set<string>();

    const pushResult = (refPath: string, charIndex: number): void => {
      if (reported.has(refPath)) return;
      const lineNum = getLineNumber(ctx.content, charIndex);
      if (codeLines.has(lineNum)) return;

      // Resolve relative to project root (strip leading slash if present)
      const relative = refPath.startsWith("/") ? refPath.slice(1) : refPath;
      const fsPath = resolve(ctx.rootDir, relative);

      if (!existsSync(fsPath)) {
        reported.add(refPath);
        results.push({
          ruleId: this.id,
          severity: "error",
          message: `References \`${refPath}\` — file/directory does not exist.`,
          line: lineNum,
          fix: "Verify the correct path and update, or remove the reference.",
        });
      }
    };

    // ---------- Pattern 1: Absolute paths starting with / ----------
    // Matches paths like /src/foo/bar.ts in running text
    const absPattern = /(?:^|[\s(])(\/[a-zA-Z][a-zA-Z0-9_\-./]*\/?)/gm;
    let match: RegExpExecArray | null;

    while ((match = absPattern.exec(ctx.content)) !== null) {
      const refPath = match[1].replace(/[`\s]/g, "").replace(/\/+$/, "");
      if (!looksLikeFilesystemPath(refPath)) continue;

      const seg = firstSegment(refPath);
      if (KNOWN_PREFIXES.has(seg)) {
        pushResult(refPath, match.index);
      }
    }

    // ---------- Pattern 2: Backtick-wrapped paths ----------
    // Matches `path/to/thing` or `/path/to/thing` inside backticks
    const backtickPattern = /`([^`\n]+)`/g;

    while ((match = backtickPattern.exec(ctx.content)) !== null) {
      const raw = match[1].trim();
      if (!looksLikeFilesystemPath(raw)) continue;

      const seg = firstSegment(raw);

      // Accept if it has a known prefix OR looks like a relative multi-segment path
      // with a file-like leaf (has an extension or is clearly a directory path)
      const hasKnownPrefix = KNOWN_PREFIXES.has(seg);
      const segments = raw.replace(/^\//, "").split("/").filter(Boolean);
      const looksLikeRelativePath =
        segments.length >= 2 &&
        segments.every((s) => /^[a-zA-Z0-9_\-][a-zA-Z0-9_\-.]*$/.test(s));

      if (hasKnownPrefix || looksLikeRelativePath) {
        pushResult(raw, match.index);
      }
    }

    return results;
  },
};
