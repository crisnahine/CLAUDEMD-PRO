/**
 * File Reader
 *
 * Reads multiple project files in a single batch call with safety controls
 * (path containment, binary detection, size limits, sensitive file warnings).
 * Used by the MCP `claudemd_read_batch` tool.
 */

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";

// ─── Types ──────────────────────────────────────────────────

export interface FileContent {
  path: string;
  content: string;
  lines: number;
  truncated: boolean;
  language: string;
}

export interface ReadBatchResult {
  files: FileContent[];
  errors: Array<{ path: string; error: string }>;
  warnings: string[];
}

// ─── Constants ──────────────────────────────────────────────

const MAX_FILES = 20;
const DEFAULT_MAX_LINES = 200;
const ABSOLUTE_MAX_LINES = 500;
const MAX_FILE_SIZE = 1_048_576; // 1MB
const BINARY_CHECK_BYTES = 8192;

const SENSITIVE_PATTERNS = [
  /^\.env$/,
  /^\.env\..+$/,
  /\.key$/,
  /\.pem$/,
  /\.p12$/,
  /\.pfx$/,
  /credentials\.json$/,
  /secret/i,
];

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".scala": "scala",
  ".cs": "csharp",
  ".php": "php",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".swift": "swift",
  ".dart": "dart",
  ".lua": "lua",
  ".r": "r",
  ".R": "r",
  ".sql": "sql",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".ps1": "powershell",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  ".html": "html",
  ".htm": "html",
  ".vue": "vue",
  ".svelte": "svelte",
  ".astro": "astro",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".md": "markdown",
  ".mdx": "mdx",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".proto": "protobuf",
  ".tf": "terraform",
  ".hcl": "hcl",
  ".dockerfile": "dockerfile",
  ".erb": "erb",
  ".ejs": "ejs",
  ".hbs": "handlebars",
};

// ─── Helpers ────────────────────────────────────────────────

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (LANGUAGE_MAP[ext]) return LANGUAGE_MAP[ext];

  // Handle extensionless files by name
  const base = filePath.split("/").pop()?.toLowerCase() ?? "";
  if (base === "dockerfile") return "dockerfile";
  if (base === "makefile") return "makefile";
  if (base === "gemfile") return "ruby";
  if (base === "rakefile") return "ruby";
  if (base === "procfile") return "yaml";

  return "plaintext";
}

function isBinary(buffer: Buffer): boolean {
  const check = buffer.subarray(0, BINARY_CHECK_BYTES);
  return check.includes(0);
}

function isSensitive(filePath: string): boolean {
  const fileName = filePath.split("/").pop() ?? "";
  return SENSITIVE_PATTERNS.some((p) => p.test(fileName));
}

// ─── Main export ────────────────────────────────────────────

export function readBatch(
  rootDir: string,
  files: string[],
  maxLinesPerFile?: number
): ReadBatchResult {
  if (files.length > MAX_FILES) {
    throw new Error(
      `File count ${files.length} exceeds limit of ${MAX_FILES} files per batch`
    );
  }

  const maxLines = Math.min(
    Math.max(1, maxLinesPerFile ?? DEFAULT_MAX_LINES),
    ABSOLUTE_MAX_LINES
  );

  const resolvedRoot = resolve(rootDir);
  const result: ReadBatchResult = { files: [], errors: [], warnings: [] };

  for (const filePath of files) {
    // Path containment check
    const resolvedPath = resolve(resolvedRoot, filePath);
    if (!resolvedPath.startsWith(resolvedRoot + "/") && resolvedPath !== resolvedRoot) {
      result.errors.push({
        path: filePath,
        error: "Path traversal rejected: resolved path is outside project root",
      });
      continue;
    }

    // Existence check
    if (!existsSync(resolvedPath)) {
      result.errors.push({ path: filePath, error: "File not found" });
      continue;
    }

    // Symlink escape check
    try {
      const realPath = realpathSync(resolvedPath);
      if (!realPath.startsWith(resolvedRoot + "/") && realPath !== resolvedRoot) {
        result.errors.push({
          path: filePath,
          error: "Symlink escape rejected: real path is outside project root",
        });
        continue;
      }
    } catch {
      result.errors.push({ path: filePath, error: "Cannot resolve symlink" });
      continue;
    }

    // Size check
    try {
      const stat = statSync(resolvedPath);
      if (!stat.isFile()) {
        result.errors.push({ path: filePath, error: "Not a regular file" });
        continue;
      }
      if (stat.size > MAX_FILE_SIZE) {
        result.errors.push({
          path: filePath,
          error: `File too large (${Math.round(stat.size / 1024)}KB > ${MAX_FILE_SIZE / 1024}KB limit)`,
        });
        continue;
      }
    } catch {
      result.errors.push({ path: filePath, error: "Cannot stat file" });
      continue;
    }

    // Sensitive file warning
    if (isSensitive(filePath)) {
      result.warnings.push(
        `Sensitive file detected: ${filePath} — review before sharing`
      );
    }

    // Read file
    try {
      const raw = readFileSync(resolvedPath);

      // Binary check
      if (isBinary(raw)) {
        result.errors.push({ path: filePath, error: "Binary file skipped" });
        continue;
      }

      const fullContent = raw.toString("utf-8");
      const allLines = fullContent.split("\n");
      const totalLines = allLines.length;
      const truncated = totalLines > maxLines;
      const content = truncated
        ? allLines.slice(0, maxLines).join("\n")
        : fullContent;

      result.files.push({
        path: filePath,
        content,
        lines: totalLines,
        truncated,
        language: detectLanguage(filePath),
      });
    } catch (err) {
      result.errors.push({
        path: filePath,
        error: `Read failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return result;
}
