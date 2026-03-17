import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { analyzeCommands } from "../../src/analyzers/commands.js";
import type { StackProfile } from "../../src/analyzers/stack-detector.js";

const TMP = join(process.cwd(), "tests/fixtures/.tmp-cmds");

function setup(files: Record<string, string>) {
  mkdirSync(TMP, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const full = join(TMP, path);
    mkdirSync(full.substring(0, full.lastIndexOf("/")), { recursive: true });
    writeFileSync(full, content);
  }
}

afterEach(() => rmSync(TMP, { recursive: true, force: true }));

function tsStack(pm = "npm"): StackProfile {
  return {
    language: "typescript",
    framework: "unknown",
    languageVersion: "5.5.0",
    runtimeVersion: "20",
    frameworkVersion: null,
    runtime: "node",
    packageManager: pm,
    monorepo: false,
    keyDeps: {},
  };
}

describe("Command description generation", () => {
  it("describes tsx as 'Run TypeScript with tsx'", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { dev: "tsx watch src/index.ts" },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const dev = result.commands.find((c) => c.command.includes("dev"));
    expect(dev?.description).toBe("Run TypeScript with tsx");
  });

  it("describes tsup as 'Bundle with tsup'", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { build: "tsup src/index.ts --format esm" },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const build = result.commands.find((c) => c.command.includes("build"));
    expect(build?.description).toBe("Bundle with tsup");
  });

  it("describes vitest correctly", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { test: "vitest run" },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const test = result.commands.find((c) => c.command.includes("test"));
    expect(test?.description).toBe("Run Vitest test suite");
  });

  it("describes vite build vs vite dev", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: {
          dev: "vite",
          build: "vite build",
        },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const dev = result.commands.find((c) => c.command.includes("dev"));
    const build = result.commands.find((c) => c.command.includes("build"));
    expect(dev?.description).toBe("Start Vite dev server");
    expect(build?.description).toBe("Build with Vite");
  });

  it("describes turbo as 'Run Turborepo task'", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { build: "turbo run build" },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const build = result.commands.find((c) => c.command.includes("build"));
    expect(build?.description).toBe("Run Turborepo task");
  });

  it("describes playwright as 'Run Playwright E2E tests'", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { "test:e2e": "playwright test" },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const e2e = result.commands.find((c) => c.command.includes("test:e2e"));
    expect(e2e?.description).toBe("Run Playwright E2E tests");
  });

  it("describes cypress as 'Run Cypress E2E tests'", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { "test:e2e": "cypress run" },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const e2e = result.commands.find((c) => c.command.includes("test:e2e"));
    expect(e2e?.description).toBe("Run Cypress E2E tests");
  });

  it("describes webpack as 'Bundle with webpack'", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { build: "webpack --mode production" },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const build = result.commands.find((c) => c.command.includes("build"));
    expect(build?.description).toBe("Bundle with webpack");
  });

  it("describes biome as 'Run Biome linter/formatter'", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { lint: "biome check ." },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const lint = result.commands.find((c) => c.command.includes("lint"));
    expect(lint?.description).toBe("Run Biome linter/formatter");
  });

  it("describes storybook as 'Start Storybook'", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { storybook: "storybook dev -p 6006" },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const sb = result.commands.find((c) => c.command.includes("storybook"));
    expect(sb?.description).toBe("Start Storybook");
  });

  it("describes concurrently as 'Run multiple commands in parallel'", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { dev: 'concurrently "npm:server" "npm:client"' },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const dev = result.commands.find((c) => c.command.includes("dev"));
    expect(dev?.description).toBe("Run multiple commands in parallel");
  });

  it("describes drizzle-kit as 'Run Drizzle Kit migrations'", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { "db:migrate": "drizzle-kit push" },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const db = result.commands.find((c) => c.command.includes("db:migrate"));
    expect(db?.description).toBe("Run Drizzle Kit migrations");
  });

  it("describes wrangler as 'Cloudflare Workers CLI'", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { deploy: "wrangler deploy" },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const deploy = result.commands.find((c) => c.command.includes("deploy"));
    expect(deploy?.description).toBe("Cloudflare Workers CLI");
  });

  it("falls back to 'Run <name>' for unknown scripts", async () => {
    setup({
      "package.json": JSON.stringify({
        scripts: { "do-stuff": "some-unknown-tool --flag" },
      }),
    });
    const result = await analyzeCommands(TMP, tsStack());
    const cmd = result.commands.find((c) => c.command.includes("do-stuff"));
    expect(cmd?.description).toBe("Run do-stuff");
  });
});
