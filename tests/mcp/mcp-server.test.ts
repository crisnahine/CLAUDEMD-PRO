/**
 * MCP Server Tests
 *
 * Tests the MCP server's JSON-RPC protocol handling and all 10 tool handlers
 * by spawning the server as a child process and sending requests over stdio.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, join } from "node:path";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";

// ─── Helpers ───────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

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

/**
 * Send a JSON-RPC request to the MCP server and wait for a response.
 */
function sendRequest(server: ChildProcess, req: JsonRpcRequest): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("MCP request timed out")), 15000);

    const handler = (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === req.id) {
            clearTimeout(timeout);
            server.stdout!.off("data", handler);
            resolve(parsed);
            return;
          }
        } catch {
          // Not JSON — skip (could be stderr leaking)
        }
      }
    };

    server.stdout!.on("data", handler);
    server.stdin!.write(JSON.stringify(req) + "\n");
  });
}

let requestId = 1;
function nextId(): number {
  return requestId++;
}

// ─── Test Suite ─────────────────────────────────────────────

describe("MCP Server", () => {
  let server: ChildProcess;
  let tmpDir: string;
  let claudeMdPath: string;

  beforeAll(async () => {
    // Create a temp project directory for testing
    tmpDir = resolve(PROJECT_ROOT, "tests/fixtures/_mcp-test-tmp");
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });

    // Write a package.json so the analyzers detect something
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({
      name: "mcp-test-project",
      scripts: {
        dev: "node index.js",
        test: "vitest run",
        build: "tsc",
      },
      dependencies: {
        express: "^4.18.0",
      },
    }, null, 2));

    // Write a minimal CLAUDE.md for lint/score/budget/fix tests
    claudeMdPath = join(tmpDir, "CLAUDE.md");
    writeFileSync(claudeMdPath, [
      "# mcp-test-project",
      "",
      "## Critical Context",
      "- TypeScript / Node.js",
      "- Express web framework",
      "",
      "## Commands",
      "```",
      "npm run dev       # Start dev server",
      "npm run test      # Run tests",
      "npm run build     # Build project",
      "```",
      "",
      "## Architecture",
      "```",
      "/src/             # Source code",
      "/tests/           # Test suite",
      "```",
      "",
      "## Gotchas — DON'T Do This",
      "- DON'T commit .env files — use .env.example for template",
      "",
    ].join("\n"));

    // Write a source file so scan_files returns something
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src/index.ts"), 'console.log("hello");');

    // Start the MCP server using the built dist version with an inline eval
    server = spawn("node", [
      "--input-type=module",
      "-e",
      `import { startMcpServer } from "${resolve(PROJECT_ROOT, "dist/mcp/index.js")}"; startMcpServer();`,
    ], {
      cwd: tmpDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });

    // Wait for server to be ready (stderr message)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 10000);
      server.stderr!.on("data", (data) => {
        if (data.toString().includes("MCP server starting")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Send initialize
    const initResp = await sendRequest(server, {
      jsonrpc: "2.0",
      id: nextId(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    });
    expect(initResp.result).toBeDefined();
    expect(initResp.result.serverInfo.name).toBe("claudemd-pro");
  }, 20000);

  afterAll(() => {
    if (server) {
      server.kill("SIGINT");
    }
    // Clean up temp directory
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ─── Protocol Tests ─────────────────────────────────────

  describe("Protocol", () => {
    it("returns server info on initialize", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "initialize",
        params: {},
      });
      expect(resp.result.serverInfo.name).toBe("claudemd-pro");
      expect(resp.result.protocolVersion).toBe("2024-11-05");
      expect(resp.result.capabilities).toBeDefined();
    });

    it("lists all 10 tools", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/list",
      });
      expect(resp.result.tools).toHaveLength(10);
      const toolNames = resp.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain("claudemd_generate");
      expect(toolNames).toContain("claudemd_lint");
      expect(toolNames).toContain("claudemd_score");
      expect(toolNames).toContain("claudemd_budget");
      expect(toolNames).toContain("claudemd_evolve");
      expect(toolNames).toContain("claudemd_compare");
      expect(toolNames).toContain("claudemd_fix");
      expect(toolNames).toContain("claudemd_validate");
      expect(toolNames).toContain("claudemd_scan_files");
      expect(toolNames).toContain("claudemd_read_batch");
    });

    it("returns error for unknown method", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "nonexistent/method",
      });
      expect(resp.error).toBeDefined();
      expect(resp.error!.code).toBe(-32601);
    });

    it("returns error for unknown tool", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: { name: "nonexistent_tool", arguments: {} },
      });
      expect(resp.error).toBeDefined();
      expect(resp.error!.code).toBe(-32601);
    });
  });

  // ─── Tool Tests ─────────────────────────────────────────

  describe("claudemd_generate", () => {
    it("generates CLAUDE.md for a project directory", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_generate",
          arguments: { rootDir: tmpDir, write: false },
        },
      });
      expect(resp.result.isError).toBe(false);
      const text = resp.result.content[0].text;
      expect(text).toContain("# mcp-test-project");
      expect(text).toContain("Commands");
    }, 15000);

    it("returns error for nonexistent directory", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_generate",
          arguments: { rootDir: "/nonexistent/path/xyz" },
        },
      });
      expect(resp.result.isError).toBe(true);
      expect(resp.result.content[0].text).toContain("Error");
    });
  });

  describe("claudemd_lint", () => {
    it("lints CLAUDE.md from content string", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_lint",
          arguments: {
            content: "# Test Project\n\n## Commands\n```\nnpm test\n```\n\n## Architecture\n```\n/src/\n```\n",
          },
        },
      });
      expect(resp.result.isError).toBe(false);
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed.score).toBeTypeOf("number");
      expect(parsed.breakdown).toBeDefined();
      expect(parsed.results).toBeInstanceOf(Array);
      expect(parsed.summary).toBeDefined();
    });

    it("lints CLAUDE.md from file path", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_lint",
          arguments: { filePath: claudeMdPath },
        },
      });
      expect(resp.result.isError).toBe(false);
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed.score).toBeGreaterThan(0);
    });

    it("errors when neither filePath nor content provided", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_lint",
          arguments: {},
        },
      });
      expect(resp.result.isError).toBe(true);
    });
  });

  describe("claudemd_score", () => {
    it("returns numeric score for content", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_score",
          arguments: {
            content: "# Project\n\n## Commands\n```\nnpm test\n```\n",
          },
        },
      });
      expect(resp.result.isError).toBe(false);
      const score = parseInt(resp.result.content[0].text, 10);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe("claudemd_budget", () => {
    it("returns token breakdown for content", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_budget",
          arguments: {
            content: "# Project\n\n## Commands\n```\nnpm test\n```\n\n## Architecture\n```\n/src/\n```\n",
            maxTokens: 5000,
          },
        },
      });
      expect(resp.result.isError).toBe(false);
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed.totalTokens).toBeTypeOf("number");
      expect(parsed.maxTokens).toBe(5000);
      expect(parsed.withinBudget).toBe(true);
      expect(parsed.sections).toBeInstanceOf(Array);
    });
  });

  describe("claudemd_compare", () => {
    it("compares two content strings", async () => {
      const contentA = "# Old Project\n\nSome content.\n";
      const contentB = "# Project\n\n## Commands\n```\nnpm test\n```\n\n## Architecture\n```\n/src/  # Source code\n```\n";

      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_compare",
          arguments: { contentA, contentB },
        },
      });
      expect(resp.result.isError).toBe(false);
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed.before.score).toBeTypeOf("number");
      expect(parsed.after.score).toBeTypeOf("number");
      expect(parsed.diff).toBeTypeOf("number");
      expect(typeof parsed.improved).toBe("boolean");
    });
  });

  describe("claudemd_fix", () => {
    it("returns fixable issues for content", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_fix",
          arguments: {
            content: "# Project\n\nJust some vague content about stuff.\n",
          },
        },
      });
      expect(resp.result.isError).toBe(false);
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed.score).toBeTypeOf("number");
      expect(parsed.fixableCount).toBeTypeOf("number");
      expect(parsed.totalIssues).toBeTypeOf("number");
      expect(parsed.fixes).toBeInstanceOf(Array);
    });
  });

  describe("claudemd_validate", () => {
    it("validates a valid config object", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_validate",
          arguments: {
            config: {
              preset: "default",
              maxTokens: 3000,
              rules: { "token-budget": "warning" },
            },
          },
        },
      });
      expect(resp.result.isError).toBe(false);
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed.valid).toBe(true);
      expect(parsed.errors).toHaveLength(0);
    });

    it("reports errors for invalid config", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_validate",
          arguments: {
            config: {
              preset: "nonexistent",
              maxTokens: -5,
              rules: "invalid",
            },
          },
        },
      });
      expect(resp.result.isError).toBe(false);
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed.valid).toBe(false);
      expect(parsed.errors.length).toBeGreaterThan(0);
    });

    it("warns about unknown config fields", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_validate",
          arguments: {
            config: { unknownField: true, anotherUnknown: "value" },
          },
        },
      });
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed.warnings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("claudemd_scan_files", () => {
    it("scans project files and returns categories", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_scan_files",
          arguments: { rootDir: tmpDir },
        },
      });
      expect(resp.result.isError).toBe(false);
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed).toBeTypeOf("object");
    }, 10000);

    it("returns error for nonexistent directory", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_scan_files",
          arguments: { rootDir: "/nonexistent/path/xyz" },
        },
      });
      expect(resp.result.isError).toBe(true);
    });
  });

  describe("claudemd_read_batch", () => {
    it("reads multiple files at once", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_read_batch",
          arguments: {
            rootDir: tmpDir,
            files: ["package.json", "src/index.ts"],
          },
        },
      });
      expect(resp.result.isError).toBe(false);
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed).toBeTypeOf("object");
    });

    it("rejects more than 20 files", async () => {
      const files = Array.from({ length: 21 }, (_, i) => `file${i}.ts`);
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_read_batch",
          arguments: { rootDir: tmpDir, files },
        },
      });
      expect(resp.result.isError).toBe(true);
      expect(resp.result.content[0].text).toContain("Too many files");
    });
  });

  describe("claudemd_evolve", () => {
    it("detects drift for a project with CLAUDE.md", async () => {
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_evolve",
          arguments: { rootDir: tmpDir },
        },
      });
      expect(resp.result.isError).toBe(false);
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(typeof parsed.drift).toBe("boolean");
      expect(parsed.issueCount).toBeTypeOf("number");
      expect(parsed.issues).toBeInstanceOf(Array);
    }, 15000);

    it("reports missing CLAUDE.md", async () => {
      const emptyDir = resolve(tmpDir, "_empty-subdir");
      mkdirSync(emptyDir, { recursive: true });
      const resp = await sendRequest(server, {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "claudemd_evolve",
          arguments: { rootDir: emptyDir },
        },
      });
      expect(resp.result.isError).toBe(false);
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed.drift).toBe(true);
      expect(parsed.issues[0].type).toBe("missing");
    });
  });
});
