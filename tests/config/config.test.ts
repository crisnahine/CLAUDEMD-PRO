import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../src/config/index.js";

const TMP = join(process.cwd(), "tests/fixtures/.tmp-config");

function setup(files: Record<string, string>) {
  mkdirSync(TMP, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(TMP, path), content);
  }
}

function cleanup() {
  rmSync(TMP, { recursive: true, force: true });
}

describe("Config Loader", () => {
  afterEach(cleanup);

  it("returns defaults when no config file exists", () => {
    setup({});
    const config = loadConfig(TMP);
    expect(config.preset).toBe("default");
    expect(config.maxTokens).toBe(3000);
  });

  it("loads .claudemdrc JSON config", () => {
    setup({
      ".claudemdrc": JSON.stringify({
        preset: "strict",
        maxTokens: 2000,
        rules: { vague: "off" },
      }),
    });
    const config = loadConfig(TMP);
    expect(config.preset).toBe("strict");
    expect(config.maxTokens).toBe(2000);
    expect(config.rules?.vague).toBe("off");
  });

  it("merges arrays from config", () => {
    setup({
      ".claudemdrc": JSON.stringify({
        exclude: ["vendor/"],
        plugins: ["my-plugin"],
      }),
    });
    const config = loadConfig(TMP);
    expect(config.exclude).toContain("vendor/");
    expect(config.plugins).toContain("my-plugin");
  });
});
