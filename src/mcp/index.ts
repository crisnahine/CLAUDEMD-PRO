/**
 * MCP Server
 *
 * Lightweight Model Context Protocol server using stdio transport (JSON-RPC
 * over stdin/stdout). Exposes claudemd-pro capabilities as MCP tools for
 * use with Claude Desktop and Claude Code.
 *
 * Protocol: reads newline-delimited JSON-RPC from stdin, writes JSON-RPC
 * responses to stdout. All diagnostic logging goes to stderr so it never
 * contaminates the protocol channel.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { analyzeCodebase } from "../analyzers/index.js";
import { detectStack } from "../analyzers/stack-detector.js";
import { scanFiles } from "../analyzers/file-scanner.js";
import { readBatch } from "../analyzers/file-reader.js";
import { renderClaudeMd } from "../core/generate.js";
import { lintContent } from "../core/lint.js";
import { countTokens, estimateTokens } from "../token/index.js";
import { loadConfig } from "../config/index.js";
import { defaultPreset } from "../linter/presets/default.js";
import { strictPreset } from "../linter/presets/strict.js";
import { leanPreset } from "../linter/presets/lean.js";
import type { LintPreset } from "../linter/types.js";

// ─── JSON-RPC Types ──────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: any;
  error?: { code: number; message: string };
}

// ─── Preset Map ──────────────────────────────────────────────

const PRESETS: Record<string, LintPreset> = {
  default: defaultPreset,
  strict: strictPreset,
  lean: leanPreset,
};

// ─── MCP Tool Definitions ────────────────────────────────────

const TOOLS = [
  {
    name: "claudemd_generate",
    description:
      "Analyze a codebase, generate a CLAUDE.md, and write it to disk. Runs all static analyzers (stack detection, architecture, commands, database, testing, gotchas, environment, CI/CD). Writes to rootDir/CLAUDE.md by default.",
    inputSchema: {
      type: "object" as const,
      properties: {
        rootDir: {
          type: "string",
          description: "Absolute path to the project root directory to analyze",
        },
        framework: {
          type: "string",
          description:
            "Force a specific framework (e.g. 'nextjs', 'rails'). Auto-detected if omitted.",
        },
        modular: {
          type: "boolean",
          description:
            "Generate with @import structure for large projects (default: false)",
        },
        preset: {
          type: "string",
          description:
            "Lint preset to validate against after generation: 'default', 'strict', or 'lean'",
        },
        monorepo: {
          type: "boolean",
          description:
            "Treat the project as a monorepo with multiple packages (default: false)",
        },
        output: {
          type: "string",
          description:
            "Output file path (default: rootDir/CLAUDE.md)",
        },
        write: {
          type: "boolean",
          description:
            "Write the file to disk (default: true). Set false to only return content.",
        },
      },
      required: ["rootDir"],
    },
  },
  {
    name: "claudemd_lint",
    description:
      "Score a CLAUDE.md file on effectiveness and return detailed lint results. Returns score breakdown across 6 dimensions plus individual lint findings with severity, message, line number, and fix suggestions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the CLAUDE.md file to lint",
        },
        content: {
          type: "string",
          description:
            "Raw CLAUDE.md content to lint (used instead of filePath)",
        },
        preset: {
          type: "string",
          description:
            "Lint preset: 'default', 'strict', or 'lean' (default: 'default')",
        },
        strict: {
          type: "boolean",
          description:
            "Use strict preset (shorthand for preset='strict'). Promotes suggestions to warnings.",
        },
      },
    },
  },
  {
    name: "claudemd_score",
    description:
      "Quick effectiveness score (0-100) for a CLAUDE.md file. Returns just the numeric score without full lint details.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the CLAUDE.md file to score",
        },
        content: {
          type: "string",
          description:
            "Raw CLAUDE.md content to score (used instead of filePath)",
        },
      },
    },
  },
  {
    name: "claudemd_budget",
    description:
      "Token breakdown analysis for a CLAUDE.md file. Shows section-by-section token counts, percentages, and whether each section is within budget.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the CLAUDE.md file to analyze",
        },
        content: {
          type: "string",
          description:
            "Raw CLAUDE.md content to analyze (used instead of filePath)",
        },
        maxTokens: {
          type: "number",
          description: "Token budget ceiling (default: 3000)",
        },
      },
    },
  },
  {
    name: "claudemd_evolve",
    description:
      "Check for drift between CLAUDE.md and the actual codebase. Detects stale references, missing sections, and outdated commands.",
    inputSchema: {
      type: "object" as const,
      properties: {
        rootDir: {
          type: "string",
          description: "Absolute path to the project root directory",
        },
        filePath: {
          type: "string",
          description:
            "Path to the CLAUDE.md file (default: rootDir/CLAUDE.md)",
        },
      },
      required: ["rootDir"],
    },
  },
  {
    name: "claudemd_compare",
    description:
      "Compare two CLAUDE.md files (or content strings) and return before/after scores with dimension-level diff.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePathA: {
          type: "string",
          description: "Absolute path to the 'before' CLAUDE.md file",
        },
        contentA: {
          type: "string",
          description: "Raw 'before' CLAUDE.md content (used instead of filePathA)",
        },
        filePathB: {
          type: "string",
          description: "Absolute path to the 'after' CLAUDE.md file",
        },
        contentB: {
          type: "string",
          description: "Raw 'after' CLAUDE.md content (used instead of filePathB)",
        },
      },
    },
  },
  {
    name: "claudemd_fix",
    description:
      "Run lint on a CLAUDE.md file and return auto-fix suggestions for each issue found. Each result includes the rule ID, severity, message, and a suggested fix string.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the CLAUDE.md file to fix",
        },
        content: {
          type: "string",
          description: "Raw CLAUDE.md content to fix (used instead of filePath)",
        },
      },
    },
  },
  {
    name: "claudemd_validate",
    description:
      "Validate a .claudemdrc configuration file (or config object) and return any errors or warnings about invalid keys, unknown presets, or malformed rules.",
    inputSchema: {
      type: "object" as const,
      properties: {
        rootDir: {
          type: "string",
          description: "Absolute path to the project root to search for config files",
        },
        config: {
          type: "object",
          description: "Raw config object to validate (used instead of rootDir)",
        },
      },
    },
  },
  {
    name: "claudemd_scan_files",
    description:
      "Categorize all project files by functional role (components, models, tests, config, routes, etc.). Returns a structured map of file categories for deeper analysis. Use after claudemd_generate to understand which files to read for richer CLAUDE.md content.",
    inputSchema: {
      type: "object" as const,
      properties: {
        rootDir: {
          type: "string",
          description: "Absolute path to the project root directory to scan",
        },
        exclude: {
          type: "array",
          items: { type: "string" },
          description:
            "Additional directory names to exclude from scanning (node_modules, .git, etc. are excluded by default)",
        },
      },
      required: ["rootDir"],
    },
  },
  {
    name: "claudemd_read_batch",
    description:
      "Read multiple project files at once and return their contents with language detection. Safety-limited to 20 files per call, 200 lines per file by default (max 500). Use after claudemd_scan_files to read key files from each category for deeper analysis.",
    inputSchema: {
      type: "object" as const,
      properties: {
        rootDir: {
          type: "string",
          description: "Absolute path to the project root directory",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of file paths relative to rootDir to read (max 20)",
        },
        maxLinesPerFile: {
          type: "number",
          description:
            "Maximum lines to read per file (default: 200, max: 500)",
        },
      },
      required: ["rootDir", "files"],
    },
  },
];

// ─── Tool Handlers ───────────────────────────────────────────

function resolveContent(
  params: { filePath?: string; content?: string }
): string {
  if (params.content) {
    return params.content;
  }
  if (params.filePath) {
    const absPath = resolve(params.filePath);
    if (!existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }
    return readFileSync(absPath, "utf-8");
  }
  throw new Error(
    "Either 'filePath' or 'content' must be provided"
  );
}

function resolveRootDir(
  params: { filePath?: string; content?: string }
): string {
  if (params.filePath) {
    const absPath = resolve(params.filePath);
    // Walk up from the file to find a plausible project root
    return resolve(absPath, "..");
  }
  return process.cwd();
}

function resolvePreset(params: { preset?: string; strict?: boolean }): LintPreset {
  if (params.strict) return strictPreset;
  return PRESETS[params.preset ?? "default"] ?? defaultPreset;
}

function parseSections(
  content: string
): Array<{ heading: string; content: string; line: number }> {
  const sections: Array<{ heading: string; content: string; line: number }> = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentContent = "";
  let currentLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          content: currentContent,
          line: currentLine,
        });
      }
      currentHeading = line.replace("## ", "").trim();
      currentContent = "";
      currentLine = i + 1;
    } else {
      currentContent += line + "\n";
    }
  }

  if (currentHeading) {
    sections.push({
      heading: currentHeading,
      content: currentContent,
      line: currentLine,
    });
  }

  return sections;
}

async function handleGenerate(params: {
  rootDir: string;
  framework?: string;
  modular?: boolean;
  preset?: string;
  monorepo?: boolean;
  output?: string;
  write?: boolean;
}): Promise<{ type: string; text: string }[]> {
  const rootDir = resolve(params.rootDir);
  if (!existsSync(rootDir)) {
    throw new Error(`Directory not found: ${rootDir}`);
  }

  const profile = await analyzeCodebase({
    rootDir,
    framework: params.framework,
  });

  const rendered = renderClaudeMd(profile, { modular: params.modular });

  const shouldWrite = params.write !== false;
  if (shouldWrite) {
    const outputPath = params.output
      ? resolve(params.output)
      : resolve(rootDir, "CLAUDE.md");
    writeFileSync(outputPath, rendered, "utf-8");
    return [{ type: "text", text: `Wrote ${outputPath}\n\n${rendered}` }];
  }

  return [{ type: "text", text: rendered }];
}

async function handleLint(params: {
  filePath?: string;
  content?: string;
  preset?: string;
  strict?: boolean;
}): Promise<{ type: string; text: string }[]> {
  const content = resolveContent(params);
  const rootDir = resolveRootDir(params);
  const preset = resolvePreset(params);

  const output = lintContent(content, rootDir, {
    rules: preset.rules,
    overrides: preset.overrides,
  });

  return [{ type: "text", text: JSON.stringify({
    score: output.score,
    breakdown: output.breakdown,
    results: output.results.map((r) => ({
      ruleId: r.ruleId,
      severity: r.severity,
      message: r.message,
      line: r.line,
      fix: r.fix,
    })),
    summary: output.summary,
  }, null, 2) }];
}

async function handleScore(params: {
  filePath?: string;
  content?: string;
}): Promise<{ type: string; text: string }[]> {
  const content = resolveContent(params);
  const rootDir = resolveRootDir(params);

  const output = lintContent(content, rootDir);

  return [{ type: "text", text: String(output.score) }];
}

async function handleBudget(params: {
  filePath?: string;
  content?: string;
  maxTokens?: number;
}): Promise<{ type: string; text: string }[]> {
  const content = resolveContent(params);
  const maxTokens = params.maxTokens ?? 3000;

  const totalTokenCount = await countTokens(content);
  const sections = parseSections(content);

  const sectionBreakdown: Array<{
    heading: string;
    tokens: number;
    percentage: number;
    overBudgetShare: boolean;
  }> = [];

  // Preamble (content before first ##)
  const preambleEnd = content.indexOf("\n## ");
  if (preambleEnd > 0) {
    const preamble = content.substring(0, preambleEnd);
    const preambleTokens = estimateTokens(preamble);
    const pct = Math.round((preambleTokens / Math.max(totalTokenCount, 1)) * 100);
    sectionBreakdown.push({
      heading: "Header/Preamble",
      tokens: preambleTokens,
      percentage: pct,
      overBudgetShare: pct > 25,
    });
  }

  for (const section of sections) {
    const sectionTokens = estimateTokens(section.content);
    const pct = Math.round(
      (sectionTokens / Math.max(totalTokenCount, 1)) * 100
    );
    sectionBreakdown.push({
      heading: section.heading,
      tokens: sectionTokens,
      percentage: pct,
      overBudgetShare: pct > 25,
    });
  }

  const output = {
    totalTokens: totalTokenCount,
    maxTokens,
    withinBudget: totalTokenCount <= maxTokens,
    overBy: totalTokenCount > maxTokens ? totalTokenCount - maxTokens : 0,
    sections: sectionBreakdown,
  };

  return [{ type: "text", text: JSON.stringify(output, null, 2) }];
}

async function handleEvolve(params: {
  rootDir: string;
  filePath?: string;
}): Promise<{ type: string; text: string }[]> {
  const rootDir = resolve(params.rootDir);
  if (!existsSync(rootDir)) {
    throw new Error(`Directory not found: ${rootDir}`);
  }

  const filePath = params.filePath
    ? resolve(params.filePath)
    : resolve(rootDir, "CLAUDE.md");

  if (!existsSync(filePath)) {
    return [
      {
        type: "text",
        text: JSON.stringify({
          drift: true,
          issues: [
            {
              type: "missing",
              message: `CLAUDE.md not found at ${filePath}. Run claudemd generate to create one.`,
            },
          ],
        }, null, 2),
      },
    ];
  }

  const content = readFileSync(filePath, "utf-8");

  // Run lint rules that detect drift (stale-ref checks paths against filesystem)
  const lintOutput = lintContent(content, rootDir);

  // Filter to drift-relevant rules
  const driftRules = new Set(["stale-ref", "missing-verify", "no-architecture", "missing-gotchas"]);
  const driftResults = lintOutput.results.filter((r) => driftRules.has(r.ruleId));

  // Check if codebase profile differs significantly from CLAUDE.md
  let profileDrift: Array<{ type: string; message: string }> = [];
  try {
    const profile = await analyzeCodebase({ rootDir });

    // Check if stack mentioned in CLAUDE.md matches detected stack
    if (
      profile.stack.framework !== "unknown" &&
      !content.toLowerCase().includes(profile.stack.framework.toLowerCase())
    ) {
      profileDrift.push({
        type: "framework-drift",
        message: `Detected framework "${profile.stack.framework}" is not mentioned in CLAUDE.md`,
      });
    }

    // Check if detected commands are present
    if (profile.commands.commands && profile.commands.commands.length > 0) {
      const hasCommandsSection = /##\s*commands/i.test(content);
      if (!hasCommandsSection) {
        profileDrift.push({
          type: "missing-commands",
          message: `Found ${profile.commands.commands.length} commands in codebase but no Commands section in CLAUDE.md`,
        });
      }
    }
  } catch {
    // Analysis failed — skip profile drift checks
  }

  const allIssues = [
    ...driftResults.map((r) => ({
      type: r.ruleId,
      severity: r.severity,
      message: r.message,
      line: r.line,
      fix: r.fix,
    })),
    ...profileDrift,
  ];

  const output = {
    drift: allIssues.length > 0,
    issueCount: allIssues.length,
    issues: allIssues,
  };

  return [{ type: "text", text: JSON.stringify(output, null, 2) }];
}

async function handleCompare(params: {
  filePathA?: string;
  contentA?: string;
  filePathB?: string;
  contentB?: string;
}): Promise<{ type: string; text: string }[]> {
  const contentA = resolveContent({ filePath: params.filePathA, content: params.contentA });
  const contentB = resolveContent({ filePath: params.filePathB, content: params.contentB });
  const rootDir = process.cwd();

  const outputA = lintContent(contentA, rootDir);
  const outputB = lintContent(contentB, rootDir);
  const diff = outputB.score - outputA.score;

  const result = {
    before: { score: outputA.score, breakdown: outputA.breakdown, issues: outputA.results.length },
    after: { score: outputB.score, breakdown: outputB.breakdown, issues: outputB.results.length },
    diff,
    improved: diff > 0,
  };

  return [{ type: "text", text: JSON.stringify(result, null, 2) }];
}

async function handleFix(params: {
  filePath?: string;
  content?: string;
}): Promise<{ type: string; text: string }[]> {
  const content = resolveContent(params);
  const rootDir = resolveRootDir(params);

  const output = lintContent(content, rootDir);

  // Return only results that have fix suggestions
  const fixable = output.results
    .filter((r) => r.fix)
    .map((r) => ({
      ruleId: r.ruleId,
      severity: r.severity,
      message: r.message,
      line: r.line,
      fix: r.fix,
    }));

  const result = {
    score: output.score,
    fixableCount: fixable.length,
    totalIssues: output.results.length,
    fixes: fixable,
  };

  return [{ type: "text", text: JSON.stringify(result, null, 2) }];
}

async function handleValidate(params: {
  rootDir?: string;
  config?: Record<string, unknown>;
}): Promise<{ type: string; text: string }[]> {
  const errors: Array<{ field: string; message: string }> = [];
  const warnings: Array<{ field: string; message: string }> = [];

  let config: Record<string, unknown>;

  if (params.config) {
    config = params.config;
  } else if (params.rootDir) {
    const rootDir = resolve(params.rootDir);
    if (!existsSync(rootDir)) {
      throw new Error(`Directory not found: ${rootDir}`);
    }
    try {
      const loaded = loadConfig(rootDir);
      config = loaded as unknown as Record<string, unknown>;
    } catch (err) {
      return [{ type: "text", text: JSON.stringify({
        valid: false,
        errors: [{ field: "config", message: `Failed to load config: ${err instanceof Error ? err.message : String(err)}` }],
        warnings: [],
      }, null, 2) }];
    }
  } else {
    throw new Error("Either 'rootDir' or 'config' must be provided");
  }

  // Validate known fields
  const knownFields = new Set(["preset", "maxTokens", "rules", "exclude", "framework", "output", "modular", "plugins"]);
  for (const key of Object.keys(config)) {
    if (!knownFields.has(key)) {
      warnings.push({ field: key, message: `Unknown config field "${key}" — will be ignored` });
    }
  }

  // Validate preset
  if (config.preset !== undefined) {
    if (typeof config.preset !== "string") {
      errors.push({ field: "preset", message: "preset must be a string" });
    } else if (!PRESETS[config.preset]) {
      errors.push({ field: "preset", message: `Unknown preset "${config.preset}". Valid: default, strict, lean` });
    }
  }

  // Validate maxTokens
  if (config.maxTokens !== undefined) {
    if (typeof config.maxTokens !== "number" || config.maxTokens < 0) {
      errors.push({ field: "maxTokens", message: "maxTokens must be a positive number" });
    } else if (config.maxTokens > 10000) {
      warnings.push({ field: "maxTokens", message: "maxTokens > 10000 is unusually high — CLAUDE.md files should be concise" });
    }
  }

  // Validate rules
  if (config.rules !== undefined) {
    if (typeof config.rules !== "object" || config.rules === null || Array.isArray(config.rules)) {
      errors.push({ field: "rules", message: "rules must be an object mapping rule IDs to severity or 'off'" });
    } else {
      const validSeverities = new Set(["error", "warning", "suggestion", "off"]);
      for (const [ruleId, severity] of Object.entries(config.rules as Record<string, unknown>)) {
        if (typeof severity !== "string" || !validSeverities.has(severity)) {
          errors.push({ field: `rules.${ruleId}`, message: `Invalid severity "${severity}" for rule "${ruleId}". Valid: error, warning, suggestion, off` });
        }
      }
    }
  }

  // Validate exclude
  if (config.exclude !== undefined) {
    if (!Array.isArray(config.exclude)) {
      errors.push({ field: "exclude", message: "exclude must be an array of strings" });
    } else {
      for (let i = 0; i < config.exclude.length; i++) {
        if (typeof config.exclude[i] !== "string") {
          errors.push({ field: `exclude[${i}]`, message: "Each exclude entry must be a string" });
        }
      }
    }
  }

  // Validate modular
  if (config.modular !== undefined && typeof config.modular !== "boolean") {
    errors.push({ field: "modular", message: "modular must be a boolean" });
  }

  // Validate framework
  if (config.framework !== undefined && typeof config.framework !== "string") {
    errors.push({ field: "framework", message: "framework must be a string" });
  }

  // Validate output
  if (config.output !== undefined && typeof config.output !== "string") {
    errors.push({ field: "output", message: "output must be a string" });
  }

  // Validate plugins
  if (config.plugins !== undefined) {
    if (!Array.isArray(config.plugins)) {
      errors.push({ field: "plugins", message: "plugins must be an array of strings" });
    } else {
      for (let i = 0; i < config.plugins.length; i++) {
        if (typeof config.plugins[i] !== "string") {
          errors.push({ field: `plugins[${i}]`, message: "Each plugin entry must be a string" });
        }
      }
    }
  }

  const result = {
    valid: errors.length === 0,
    errors,
    warnings,
  };

  return [{ type: "text", text: JSON.stringify(result, null, 2) }];
}

async function handleScanFiles(params: {
  rootDir: string;
  exclude?: string[];
}): Promise<{ type: string; text: string }[]> {
  const rootDir = resolve(params.rootDir);
  if (!existsSync(rootDir)) {
    throw new Error(`Directory not found: ${rootDir}`);
  }

  const stack = await detectStack(rootDir);
  const result = scanFiles(rootDir, params.exclude, stack.framework);

  return [{ type: "text", text: JSON.stringify(result, null, 2) }];
}

async function handleReadBatch(params: {
  rootDir: string;
  files: string[];
  maxLinesPerFile?: number;
}): Promise<{ type: string; text: string }[]> {
  const rootDir = resolve(params.rootDir);
  if (!existsSync(rootDir)) {
    throw new Error(`Directory not found: ${rootDir}`);
  }

  if (params.files.length > 20) {
    throw new Error(
      `Too many files requested (${params.files.length}). Maximum is 20 per call.`
    );
  }

  const result = readBatch(rootDir, params.files, params.maxLinesPerFile);

  return [{ type: "text", text: JSON.stringify(result, null, 2) }];
}

// ─── MCP Protocol Handler ────────────────────────────────────

const SERVER_INFO = {
  name: "claudemd-pro",
  version: "0.5.1",
};

const CAPABILITIES = {
  tools: {},
};

function makeResponse(id: number | string, result: any): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function makeError(
  id: number | string,
  code: number,
  message: string
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = req;

  switch (method) {
    case "initialize":
      return makeResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: CAPABILITIES,
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
      // Client acknowledgement — no response needed, but if id is present
      // we return a simple ack
      return makeResponse(id, {});

    case "tools/list":
      return makeResponse(id, { tools: TOOLS });

    case "tools/call": {
      const toolName: string = params?.name;
      const toolArgs = params?.arguments ?? {};

      try {
        let content: { type: string; text: string }[];

        switch (toolName) {
          case "claudemd_generate":
            content = await handleGenerate(toolArgs);
            break;
          case "claudemd_lint":
            content = await handleLint(toolArgs);
            break;
          case "claudemd_score":
            content = await handleScore(toolArgs);
            break;
          case "claudemd_budget":
            content = await handleBudget(toolArgs);
            break;
          case "claudemd_evolve":
            content = await handleEvolve(toolArgs);
            break;
          case "claudemd_compare":
            content = await handleCompare(toolArgs);
            break;
          case "claudemd_fix":
            content = await handleFix(toolArgs);
            break;
          case "claudemd_validate":
            content = await handleValidate(toolArgs);
            break;
          case "claudemd_scan_files":
            content = await handleScanFiles(toolArgs);
            break;
          case "claudemd_read_batch":
            content = await handleReadBatch(toolArgs);
            break;
          default:
            return makeError(id, -32601, `Unknown tool: ${toolName}`);
        }

        return makeResponse(id, { content, isError: false });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        return makeResponse(id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    default:
      return makeError(id, -32601, `Method not found: ${method}`);
  }
}

// ─── Stdio Transport ─────────────────────────────────────────

export function startMcpServer(): void {
  console.error("[claudemd-pro] MCP server starting on stdio...");

  const rl = createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on("line", async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed);
    } catch {
      const errResp: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 0,
        error: { code: -32700, message: "Parse error" },
      };
      process.stdout.write(JSON.stringify(errResp) + "\n");
      return;
    }

    // Notifications (no id) don't require a response
    if (req.id === undefined || req.id === null) {
      console.error(`[claudemd-pro] Received notification: ${req.method}`);
      return;
    }

    try {
      const response = await handleRequest(req);
      process.stdout.write(JSON.stringify(response) + "\n");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      const errResp = makeError(req.id, -32603, `Internal error: ${message}`);
      process.stdout.write(JSON.stringify(errResp) + "\n");
    }
  });

  rl.on("close", () => {
    console.error("[claudemd-pro] MCP server stdin closed, exiting.");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.error("[claudemd-pro] MCP server received SIGINT, exiting.");
    process.exit(0);
  });
}
