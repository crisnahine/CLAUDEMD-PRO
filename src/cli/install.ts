/**
 * Install Command
 *
 * Automatically configures claudemd-pro MCP server for
 * Claude Desktop and/or Claude Code.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";

interface InstallOptions {
  claudeDesktop?: boolean;
  claudeCode?: boolean;
}

const MCP_ENTRY = {
  command: "npx",
  args: ["claudemd-pro", "serve"],
};

function readJsonSafe(path: string): Record<string, any> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeJsonPretty(path: string, data: Record<string, any>): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function installClaudeDesktop(): boolean {
  const configDir = join(
    homedir(),
    "Library",
    "Application Support",
    "Claude"
  );
  const configPath = join(configDir, "claude_desktop_config.json");

  // Check if Claude Desktop is installed
  if (!existsSync(configDir)) {
    // Create the directory — Claude Desktop will pick it up
    mkdirSync(configDir, { recursive: true });
  }

  const existing = readJsonSafe(configPath) ?? {};
  const servers = existing.mcpServers ?? {};

  if (servers["claudemd-pro"]) {
    console.log(
      chalk.yellow("  Claude Desktop: already configured, updating...")
    );
  }

  servers["claudemd-pro"] = MCP_ENTRY;
  existing.mcpServers = servers;

  writeJsonPretty(configPath, existing);
  console.log(chalk.green("  Claude Desktop: installed"));
  console.log(chalk.dim(`    ${configPath}`));
  return true;
}

function installClaudeCode(): boolean {
  const projectRoot = process.cwd();
  const configPath = join(projectRoot, ".mcp.json");

  const existing = readJsonSafe(configPath) ?? {};
  const servers = existing.mcpServers ?? {};

  if (servers["claudemd-pro"]) {
    console.log(
      chalk.yellow("  Claude Code: already configured, updating...")
    );
  }

  servers["claudemd-pro"] = MCP_ENTRY;
  existing.mcpServers = servers;

  writeJsonPretty(configPath, existing);
  console.log(chalk.green("  Claude Code: installed"));
  console.log(chalk.dim(`    ${configPath}`));
  return true;
}

export async function installCommand(opts: InstallOptions): Promise<void> {
  const both = !opts.claudeDesktop && !opts.claudeCode;

  console.log(chalk.bold("\n  claudemd-pro — Installing MCP server\n"));

  let installed = 0;

  if (both || opts.claudeDesktop) {
    try {
      if (installClaudeDesktop()) installed++;
    } catch (err) {
      console.log(
        chalk.red(
          `  Claude Desktop: failed — ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  if (both || opts.claudeCode) {
    try {
      if (installClaudeCode()) installed++;
    } catch (err) {
      console.log(
        chalk.red(
          `  Claude Code: failed — ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  if (installed > 0) {
    console.log(
      chalk.green(
        "\n  Done! Restart Claude Desktop / Claude Code to activate.\n"
      )
    );
    console.log(chalk.dim("  10 MCP tools are now available:"));
    console.log(chalk.dim("    claudemd_generate, claudemd_lint, claudemd_score, claudemd_budget,"));
    console.log(chalk.dim("    claudemd_evolve, claudemd_compare, claudemd_fix, claudemd_validate,"));
    console.log(chalk.dim("    claudemd_scan_files, claudemd_read_batch\n"));
  }
}
