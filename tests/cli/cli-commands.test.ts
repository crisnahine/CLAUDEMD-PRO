/**
 * CLI Command Tests
 *
 * Tests CLI commands by running them as child processes via `tsx`.
 * Verifies exit codes, stdout/stderr output, and file generation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

// ─── Helpers ─────────────────────────────────────────────

function runCli(args: string, opts?: { cwd?: string; expectFail?: boolean }): { stdout: string; stderr: string; exitCode: number } {
  const cwd = opts?.cwd ?? PROJECT_ROOT;
  // Use the built dist version for CLI testing (avoids tsx loader issues)
  const cliDist = resolve(PROJECT_ROOT, "dist/cli/index.js");
  try {
    const stdout = execSync(`node ${cliDist} ${args}`, {
      cwd,
      encoding: "utf-8",
      timeout: 30000,
      env: { ...process.env, NODE_NO_WARNINGS: "1", FORCE_COLOR: "0" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    if (opts?.expectFail) {
      return {
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? "",
        exitCode: err.status ?? 1,
      };
    }
    throw err;
  }
}

// ─── Temp directory for test projects ────────────────────

let tmpDir: string;
let claudeMdPath: string;

beforeAll(() => {
  tmpDir = resolve(PROJECT_ROOT, "tests/fixtures/_cli-test-tmp");
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  // Write a package.json
  writeFileSync(join(tmpDir, "package.json"), JSON.stringify({
    name: "cli-test-project",
    scripts: {
      dev: "node server.js",
      test: "jest",
      build: "tsc",
      lint: "eslint .",
    },
    dependencies: { express: "^4.18.0" },
    devDependencies: { jest: "^29.0.0", eslint: "^8.0.0", typescript: "^5.0.0" },
  }, null, 2));

  // Write some source files
  mkdirSync(join(tmpDir, "src"), { recursive: true });
  writeFileSync(join(tmpDir, "src/index.ts"), 'import express from "express";\nconst app = express();\napp.listen(3000);');
  mkdirSync(join(tmpDir, "tests"), { recursive: true });
  writeFileSync(join(tmpDir, "tests/app.test.ts"), 'test("works", () => { expect(1).toBe(1); });');

  // Write a CLAUDE.md for lint/budget/score commands
  claudeMdPath = join(tmpDir, "CLAUDE.md");
  writeFileSync(claudeMdPath, [
    "# cli-test-project",
    "",
    "## Critical Context",
    "- TypeScript / Node.js 20+",
    "- Express web server",
    "- Jest testing framework",
    "",
    "## Commands",
    "```",
    "npm run dev                          # Start dev server",
    "npm run test                         # Run Jest test suite",
    "npm run build                        # Build with tsc",
    "npm run lint                         # Run ESLint",
    "```",
    "",
    "## Architecture",
    "```",
    "/src/             # Application source code",
    "/tests/           # Test suite",
    "```",
    "",
    "## Gotchas — DON'T Do This",
    "- DON'T commit .env files — use .env.example for template",
    "- DON'T use `any` type — always provide explicit types",
    "",
  ].join("\n"));
});

afterAll(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── Tests ──────────────────────────────────────────────

describe("CLI Commands", () => {
  describe("--version", () => {
    it("prints version number", () => {
      const { stdout } = runCli("--version");
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("--help", () => {
    it("shows available commands", () => {
      const { stdout } = runCli("--help");
      expect(stdout).toContain("generate");
      expect(stdout).toContain("lint");
      expect(stdout).toContain("budget");
      expect(stdout).toContain("evolve");
      expect(stdout).toContain("compare");
      expect(stdout).toContain("serve");
      expect(stdout).toContain("install");
    });
  });

  describe("generate", () => {
    it("generates CLAUDE.md for a project directory", () => {
      const outputPath = join(tmpDir, "GENERATED.md");
      const { stdout } = runCli(`generate -o GENERATED.md`, { cwd: tmpDir });
      expect(stdout).toContain("Analyzing");
      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, "utf-8");
      expect(content).toContain("# cli-test-project");
      expect(content).toContain("Commands");
    }, 30000);

    it("supports --dry-run (no file written)", () => {
      const outputPath = join(tmpDir, "DRYRUN.md");
      const { stdout } = runCli(`generate -o DRYRUN.md --dry-run`, { cwd: tmpDir });
      expect(stdout).toContain("DRY RUN");
      expect(existsSync(outputPath)).toBe(false);
    }, 30000);

    it("generates CLAUDE.md with correct project name", () => {
      const { stdout } = runCli(`generate --dry-run`, { cwd: tmpDir });
      expect(stdout).toContain("cli-test-project");
    }, 30000);
  });

  describe("lint", () => {
    it("scores CLAUDE.md and outputs text format", () => {
      const { stdout } = runCli(`lint CLAUDE.md`, { cwd: tmpDir });
      expect(stdout).toContain("Effectiveness Score");
      expect(stdout).toMatch(/\d+\/100/);
    });

    it("outputs JSON format with --format json", () => {
      const { stdout } = runCli(`lint CLAUDE.md --format json`, { cwd: tmpDir });
      const parsed = JSON.parse(stdout);
      expect(parsed.score).toBeTypeOf("number");
      expect(parsed.breakdown).toBeDefined();
      expect(parsed.results).toBeInstanceOf(Array);
      expect(parsed.preset).toBe("default");
    });

    it("outputs score-only format", () => {
      const { stdout } = runCli(`lint CLAUDE.md --format score`, { cwd: tmpDir });
      expect(stdout).toContain("Effectiveness Score");
      expect(stdout).toMatch(/\d+\/100/);
    });

    it("fails on nonexistent file", () => {
      const { exitCode } = runCli(`lint nonexistent.md`, {
        cwd: tmpDir,
        expectFail: true,
      });
      expect(exitCode).not.toBe(0);
    });

    it("supports presets", () => {
      const { stdout } = runCli(`lint CLAUDE.md --format json --preset strict`, { cwd: tmpDir });
      const parsed = JSON.parse(stdout);
      expect(parsed.preset).toBe("strict");
      expect(parsed.score).toBeTypeOf("number");
    });
  });

  describe("score", () => {
    it("outputs quick score", () => {
      const { stdout } = runCli(`score CLAUDE.md`, { cwd: tmpDir });
      expect(stdout).toContain("Effectiveness Score");
      expect(stdout).toMatch(/\d+\/100/);
    });
  });

  describe("budget", () => {
    it("shows token breakdown", () => {
      const { stdout } = runCli(`budget CLAUDE.md`, { cwd: tmpDir });
      expect(stdout).toContain("Token Budget Analysis");
      expect(stdout).toContain("tokens");
      expect(stdout).toMatch(/Budget:/);
    });

    it("reports budget status", () => {
      const { stdout } = runCli(`budget CLAUDE.md --max-tokens 10000`, { cwd: tmpDir });
      expect(stdout).toContain("Within budget");
    });

    it("fails on nonexistent file", () => {
      const { exitCode } = runCli(`budget nonexistent.md`, {
        cwd: tmpDir,
        expectFail: true,
      });
      expect(exitCode).not.toBe(0);
    });
  });

  describe("compare", () => {
    it("compares two CLAUDE.md files and shows diff", () => {
      // Create a worse version for comparison
      const worsePath = join(tmpDir, "WORSE.md");
      writeFileSync(worsePath, "# Old Project\n\nSome content.\n");

      const { stdout } = runCli(`compare WORSE.md CLAUDE.md`, { cwd: tmpDir });
      expect(stdout).toContain("Before");
      expect(stdout).toContain("After");
      expect(stdout).toMatch(/\d+\/100/);
    });

    it("outputs JSON format", () => {
      const worsePath = join(tmpDir, "WORSE.md");
      writeFileSync(worsePath, "# Old Project\n\nSome content.\n");

      const { stdout } = runCli(`compare WORSE.md CLAUDE.md --format json`, { cwd: tmpDir });
      const parsed = JSON.parse(stdout);
      expect(parsed.before.score).toBeTypeOf("number");
      expect(parsed.after.score).toBeTypeOf("number");
      expect(parsed.diff).toBeTypeOf("number");
      expect(typeof parsed.improved).toBe("boolean");
    });

    it("fails when file A is missing", () => {
      const { exitCode } = runCli(`compare nonexistent.md CLAUDE.md`, {
        cwd: tmpDir,
        expectFail: true,
      });
      expect(exitCode).not.toBe(0);
    });
  });

  describe("evolve", () => {
    it("detects drift for CLAUDE.md", () => {
      const { stdout } = runCli(`evolve CLAUDE.md`, { cwd: tmpDir });
      expect(stdout).toContain("Drift Report");
    }, 30000);

    it("outputs JSON format", () => {
      const { stdout } = runCli(`evolve CLAUDE.md --format json`, { cwd: tmpDir });
      const parsed = JSON.parse(stdout);
      expect(parsed.driftItems).toBeInstanceOf(Array);
      expect(parsed.currentScore).toBeTypeOf("number");
    }, 30000);

    it("fails on nonexistent file", () => {
      const { exitCode } = runCli(`evolve nonexistent.md`, {
        cwd: tmpDir,
        expectFail: true,
      });
      expect(exitCode).not.toBe(0);
    });
  });
});
