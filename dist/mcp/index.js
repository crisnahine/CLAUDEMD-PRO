import {
  analyzeCodebase,
  countTokens,
  estimateTokens
} from "../chunk-ALHWSAPL.js";
import {
  buildContext,
  calculateScore,
  runRules,
  totalScore
} from "../chunk-OWG3WG3R.js";

// src/mcp/index.ts
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createInterface } from "readline";
var TOOLS = [
  {
    name: "claudemd_generate",
    description: "Analyze a codebase and return generated CLAUDE.md content. Runs all static analyzers (stack detection, architecture, commands, database, testing, gotchas, environment, CI/CD) and renders a complete CLAUDE.md.",
    inputSchema: {
      type: "object",
      properties: {
        rootDir: {
          type: "string",
          description: "Absolute path to the project root directory to analyze"
        },
        framework: {
          type: "string",
          description: "Force a specific framework (e.g. 'nextjs', 'rails'). Auto-detected if omitted."
        },
        modular: {
          type: "boolean",
          description: "Generate with @import structure for large projects (default: false)"
        }
      },
      required: ["rootDir"]
    }
  },
  {
    name: "claudemd_lint",
    description: "Score a CLAUDE.md file on effectiveness and return detailed lint results. Returns score breakdown across 6 dimensions plus individual lint findings with severity, message, line number, and fix suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the CLAUDE.md file to lint"
        },
        content: {
          type: "string",
          description: "Raw CLAUDE.md content to lint (used instead of filePath)"
        }
      }
    }
  },
  {
    name: "claudemd_score",
    description: "Quick effectiveness score (0-100) for a CLAUDE.md file. Returns just the numeric score without full lint details.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the CLAUDE.md file to score"
        },
        content: {
          type: "string",
          description: "Raw CLAUDE.md content to score (used instead of filePath)"
        }
      }
    }
  },
  {
    name: "claudemd_budget",
    description: "Token breakdown analysis for a CLAUDE.md file. Shows section-by-section token counts, percentages, and whether each section is within budget.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the CLAUDE.md file to analyze"
        },
        content: {
          type: "string",
          description: "Raw CLAUDE.md content to analyze (used instead of filePath)"
        },
        maxTokens: {
          type: "number",
          description: "Token budget ceiling (default: 3000)"
        }
      }
    }
  },
  {
    name: "claudemd_evolve",
    description: "Check for drift between CLAUDE.md and the actual codebase. Detects stale references, missing sections, and outdated commands.",
    inputSchema: {
      type: "object",
      properties: {
        rootDir: {
          type: "string",
          description: "Absolute path to the project root directory"
        },
        filePath: {
          type: "string",
          description: "Path to the CLAUDE.md file (default: rootDir/CLAUDE.md)"
        }
      },
      required: ["rootDir"]
    }
  }
];
function resolveContent(params) {
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
function resolveRootDir(params) {
  if (params.filePath) {
    const absPath = resolve(params.filePath);
    return resolve(absPath, "..");
  }
  return process.cwd();
}
function parseSections(content) {
  const sections = [];
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
          line: currentLine
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
      line: currentLine
    });
  }
  return sections;
}
async function handleGenerate(params) {
  const rootDir = resolve(params.rootDir);
  if (!existsSync(rootDir)) {
    throw new Error(`Directory not found: ${rootDir}`);
  }
  const profile = await analyzeCodebase({
    rootDir,
    framework: params.framework
  });
  const sections = [];
  const { stack, architecture, commands, database, testing, gotchas, environment, cicd } = profile;
  let projectName = rootDir.split("/").pop() ?? "Project";
  try {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
    if (pkg.name) projectName = pkg.name;
  } catch {
  }
  sections.push(`# ${projectName}
`);
  const ctx = [];
  if (stack.language !== "unknown") {
    const lang = stack.languageVersion ? `${stack.language.charAt(0).toUpperCase() + stack.language.slice(1)} ${stack.languageVersion}` : stack.language.charAt(0).toUpperCase() + stack.language.slice(1);
    ctx.push(`- ${lang}`);
  }
  if (stack.framework !== "unknown") {
    const fw = stack.frameworkVersion ? `${stack.framework.charAt(0).toUpperCase() + stack.framework.slice(1)} ${stack.frameworkVersion}` : stack.framework.charAt(0).toUpperCase() + stack.framework.slice(1);
    ctx.push(`- Framework: ${fw}`);
  }
  if (database.adapter) {
    const dbLine = database.orm ? `${database.adapter.charAt(0).toUpperCase() + database.adapter.slice(1)} with ${database.orm}` : database.adapter.charAt(0).toUpperCase() + database.adapter.slice(1);
    ctx.push(`- Database: ${dbLine}${database.tableCount ? ` (${database.tableCount} tables)` : ""}`);
  }
  if (testing.framework) {
    ctx.push(`- Testing: ${testing.framework}${testing.coverageTool ? ` + ${testing.coverageTool}` : ""}`);
  }
  if (ctx.length > 0) {
    sections.push(`## Critical Context
${ctx.join("\n")}
`);
  }
  if (commands.commands && commands.commands.length > 0) {
    const cmdLines = [];
    const order = ["dev", "test", "lint", "db", "build", "deploy", "other"];
    const byCategory = {};
    for (const cmd of commands.commands) {
      (byCategory[cmd.category] ??= []).push(cmd);
    }
    for (const cat of order) {
      const cmds = byCategory[cat];
      if (!cmds?.length) continue;
      for (const cmd of cmds.slice(0, 4)) {
        cmdLines.push(`${cmd.command.padEnd(35)} # ${cmd.description}`);
      }
    }
    if (cmdLines.length > 0) {
      sections.push(`## Commands
\`\`\`
${cmdLines.join("\n")}
\`\`\`
`);
    }
  }
  if (architecture.topLevelDirs && architecture.topLevelDirs.length > 0) {
    const dirLines = architecture.topLevelDirs.filter((d) => d.fileCount > 0).slice(0, 15).map((d) => `${"/" + d.path + "/"}`.padEnd(30) + `# ${d.purpose} (${d.fileCount} files)`);
    sections.push(`## Architecture
\`\`\`
${dirLines.join("\n")}
\`\`\`
`);
  }
  if (architecture.patterns && architecture.patterns.length > 0) {
    const patternLines = architecture.patterns.map((p) => `- ${p}`);
    sections.push(`## Key Patterns
${patternLines.join("\n")}
`);
  }
  if (gotchas.gotchas && gotchas.gotchas.length > 0) {
    const gotchaLines = gotchas.gotchas.map((g) => `- ${g.rule} \u2014 ${g.reason}`);
    sections.push(`## Gotchas \u2014 DON'T Do This
${gotchaLines.join("\n")}
`);
  }
  if (environment.envVars && environment.envVars.length > 0) {
    const criticalEnvVars = environment.envVars.filter((e) => !e.hasDefault).slice(0, 10);
    if (criticalEnvVars.length > 0) {
      const envLines = criticalEnvVars.map((e) => `- \`${e.name}\` (required, no default)`);
      sections.push(`## Required Environment Variables
${envLines.join("\n")}
`);
    }
  }
  if (cicd.provider) {
    sections.push(
      `## CI/CD
- Provider: ${cicd.provider}
- Workflows: ${cicd.workflowFiles.join(", ")}
`
    );
  }
  if (params.modular && architecture.estimatedSize === "large" && architecture.topLevelDirs && architecture.topLevelDirs.length > 8) {
    const importCandidates = architecture.topLevelDirs.filter((d) => d.fileCount > 20).slice(0, 5);
    if (importCandidates.length > 0) {
      const importLines = importCandidates.map(
        (d) => `@import ./${d.path}/CLAUDE.md   # ${d.purpose}`
      );
      sections.push(`## Module Context (create child CLAUDE.md files)
${importLines.join("\n")}
`);
    }
  }
  const rendered = sections.join("\n");
  return [{ type: "text", text: rendered }];
}
async function handleLint(params) {
  const content = resolveContent(params);
  const rootDir = resolveRootDir(params);
  const ctx = buildContext(content, rootDir);
  const results = runRules(ctx);
  const breakdown = calculateScore(content, results);
  const score = totalScore(breakdown);
  const output = {
    score,
    breakdown,
    results: results.map((r) => ({
      ruleId: r.ruleId,
      severity: r.severity,
      message: r.message,
      line: r.line,
      fix: r.fix
    })),
    summary: {
      errors: results.filter((r) => r.severity === "error").length,
      warnings: results.filter((r) => r.severity === "warning").length,
      suggestions: results.filter((r) => r.severity === "suggestion").length
    }
  };
  return [{ type: "text", text: JSON.stringify(output, null, 2) }];
}
async function handleScore(params) {
  const content = resolveContent(params);
  const rootDir = resolveRootDir(params);
  const ctx = buildContext(content, rootDir);
  const results = runRules(ctx);
  const breakdown = calculateScore(content, results);
  const score = totalScore(breakdown);
  return [{ type: "text", text: String(score) }];
}
async function handleBudget(params) {
  const content = resolveContent(params);
  const maxTokens = params.maxTokens ?? 3e3;
  const totalTokenCount = await countTokens(content);
  const sections = parseSections(content);
  const sectionBreakdown = [];
  const preambleEnd = content.indexOf("\n## ");
  if (preambleEnd > 0) {
    const preamble = content.substring(0, preambleEnd);
    const preambleTokens = estimateTokens(preamble);
    const pct = Math.round(preambleTokens / Math.max(totalTokenCount, 1) * 100);
    sectionBreakdown.push({
      heading: "Header/Preamble",
      tokens: preambleTokens,
      percentage: pct,
      overBudgetShare: pct > 25
    });
  }
  for (const section of sections) {
    const sectionTokens = estimateTokens(section.content);
    const pct = Math.round(
      sectionTokens / Math.max(totalTokenCount, 1) * 100
    );
    sectionBreakdown.push({
      heading: section.heading,
      tokens: sectionTokens,
      percentage: pct,
      overBudgetShare: pct > 25
    });
  }
  const output = {
    totalTokens: totalTokenCount,
    maxTokens,
    withinBudget: totalTokenCount <= maxTokens,
    overBy: totalTokenCount > maxTokens ? totalTokenCount - maxTokens : 0,
    sections: sectionBreakdown
  };
  return [{ type: "text", text: JSON.stringify(output, null, 2) }];
}
async function handleEvolve(params) {
  const rootDir = resolve(params.rootDir);
  if (!existsSync(rootDir)) {
    throw new Error(`Directory not found: ${rootDir}`);
  }
  const filePath = params.filePath ? resolve(params.filePath) : resolve(rootDir, "CLAUDE.md");
  if (!existsSync(filePath)) {
    return [
      {
        type: "text",
        text: JSON.stringify({
          drift: true,
          issues: [
            {
              type: "missing",
              message: `CLAUDE.md not found at ${filePath}. Run claudemd generate to create one.`
            }
          ]
        }, null, 2)
      }
    ];
  }
  const content = readFileSync(filePath, "utf-8");
  const ctx = buildContext(content, rootDir);
  const results = runRules(ctx);
  const driftRules = /* @__PURE__ */ new Set(["stale-ref", "missing-verify", "no-architecture", "missing-gotchas"]);
  const driftResults = results.filter((r) => driftRules.has(r.ruleId));
  let profileDrift = [];
  try {
    const profile = await analyzeCodebase({ rootDir });
    if (profile.stack.framework !== "unknown" && !content.toLowerCase().includes(profile.stack.framework.toLowerCase())) {
      profileDrift.push({
        type: "framework-drift",
        message: `Detected framework "${profile.stack.framework}" is not mentioned in CLAUDE.md`
      });
    }
    if (profile.commands.commands && profile.commands.commands.length > 0) {
      const hasCommandsSection = /##\s*commands/i.test(content);
      if (!hasCommandsSection) {
        profileDrift.push({
          type: "missing-commands",
          message: `Found ${profile.commands.commands.length} commands in codebase but no Commands section in CLAUDE.md`
        });
      }
    }
  } catch {
  }
  const allIssues = [
    ...driftResults.map((r) => ({
      type: r.ruleId,
      severity: r.severity,
      message: r.message,
      line: r.line,
      fix: r.fix
    })),
    ...profileDrift
  ];
  const output = {
    drift: allIssues.length > 0,
    issueCount: allIssues.length,
    issues: allIssues
  };
  return [{ type: "text", text: JSON.stringify(output, null, 2) }];
}
var SERVER_INFO = {
  name: "claudemd-pro",
  version: "0.1.0"
};
var CAPABILITIES = {
  tools: {}
};
function makeResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function makeError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
async function handleRequest(req) {
  const { id, method, params } = req;
  switch (method) {
    case "initialize":
      return makeResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: CAPABILITIES,
        serverInfo: SERVER_INFO
      });
    case "notifications/initialized":
      return makeResponse(id, {});
    case "tools/list":
      return makeResponse(id, { tools: TOOLS });
    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};
      try {
        let content;
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
          default:
            return makeError(id, -32601, `Unknown tool: ${toolName}`);
        }
        return makeResponse(id, { content, isError: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return makeResponse(id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true
        });
      }
    }
    default:
      return makeError(id, -32601, `Method not found: ${method}`);
  }
}
function startMcpServer() {
  console.error("[claudemd-pro] MCP server starting on stdio...");
  const rl = createInterface({
    input: process.stdin,
    terminal: false
  });
  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      const errResp = {
        jsonrpc: "2.0",
        id: 0,
        error: { code: -32700, message: "Parse error" }
      };
      process.stdout.write(JSON.stringify(errResp) + "\n");
      return;
    }
    if (req.id === void 0 || req.id === null) {
      console.error(`[claudemd-pro] Received notification: ${req.method}`);
      return;
    }
    try {
      const response = await handleRequest(req);
      process.stdout.write(JSON.stringify(response) + "\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
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
export {
  startMcpServer
};
