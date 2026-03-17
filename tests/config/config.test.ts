import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, validateConfig } from "../../src/config/index.js";

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

  it("loads .claudemdrc.yaml config", () => {
    setup({
      ".claudemdrc.yaml": "preset: lean\nmaxTokens: 1500\n",
    });
    const config = loadConfig(TMP);
    expect(config.preset).toBe("lean");
    expect(config.maxTokens).toBe(1500);
  });

  it("loads from package.json claudemd key", () => {
    setup({
      "package.json": JSON.stringify({
        name: "test",
        claudemd: {
          preset: "strict",
          maxTokens: 2500,
        },
      }),
    });
    const config = loadConfig(TMP);
    expect(config.preset).toBe("strict");
    expect(config.maxTokens).toBe(2500);
  });

  it("handles invalid config gracefully (returns defaults)", () => {
    setup({
      ".claudemdrc": "not valid json {{{",
    });
    const config = loadConfig(TMP);
    expect(config.preset).toBe("default");
    expect(config.maxTokens).toBe(3000);
  });

  it("merges exclude arrays with defaults", () => {
    setup({
      ".claudemdrc": JSON.stringify({
        exclude: ["vendor/", "tmp/"],
      }),
    });
    const config = loadConfig(TMP);
    expect(config.exclude).toContain("vendor/");
    expect(config.exclude).toContain("tmp/");
  });
});

describe("Config Validation", () => {
  it("returns no warnings for valid config", () => {
    const warnings = validateConfig({
      preset: "strict",
      maxTokens: 2000,
      rules: { vague: "off", "stale-ref": "warning" },
      exclude: ["vendor/"],
      modular: true,
    });
    expect(warnings).toHaveLength(0);
  });

  it("warns on unknown keys", () => {
    const warnings = validateConfig({ unknownKey: true });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe("unknownKey");
  });

  it("warns when maxTokens is not a number", () => {
    const warnings = validateConfig({ maxTokens: "3000" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe("maxTokens");
  });

  it("warns on unknown preset", () => {
    const warnings = validateConfig({ preset: "super-strict" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe("preset");
    expect(warnings[0].message).toContain("super-strict");
  });

  it("warns when modular is not boolean", () => {
    const warnings = validateConfig({ modular: "yes" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe("modular");
  });

  it("warns when exclude is not an array", () => {
    const warnings = validateConfig({ exclude: "vendor/" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe("exclude");
  });

  it("warns on invalid rule severity", () => {
    const warnings = validateConfig({
      rules: { vague: "off", "stale-ref": "critical" },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe("rules.stale-ref");
    expect(warnings[0].message).toContain("critical");
  });

  it("accepts all valid severities", () => {
    const warnings = validateConfig({
      rules: { a: "error", b: "warning", c: "suggestion", d: "off" },
    });
    expect(warnings).toHaveLength(0);
  });
});
