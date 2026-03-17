import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { detectStack } from "../../src/analyzers/stack-detector.js";

const TMP = join(process.cwd(), "tests/fixtures/.tmp-version");

function setup(files: Record<string, string>) {
  mkdirSync(TMP, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const full = join(TMP, path);
    mkdirSync(full.substring(0, full.lastIndexOf("/")), { recursive: true });
    writeFileSync(full, content);
  }
}

afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("Version parsing — runtimeVersion vs languageVersion", () => {
  it("separates TypeScript version from Node version via .nvmrc", async () => {
    setup({
      "package.json": JSON.stringify({
        devDependencies: { typescript: "^5.5.3" },
      }),
      "tsconfig.json": "{}",
      ".nvmrc": "20.11.0",
    });
    const result = await detectStack(TMP);
    expect(result.languageVersion).toBe("5.5.3");
    expect(result.runtimeVersion).toBe("20.11.0");
  });

  it("separates TypeScript version from Node engines field", async () => {
    setup({
      "package.json": JSON.stringify({
        engines: { node: ">=20.0.0" },
        devDependencies: { typescript: "~5.3.0" },
      }),
      "tsconfig.json": "{}",
    });
    const result = await detectStack(TMP);
    expect(result.languageVersion).toBe("5.3.0");
    expect(result.runtimeVersion).toBe(">=20.0.0");
  });

  it("strips ^ prefix from TypeScript version", async () => {
    setup({
      "package.json": JSON.stringify({
        devDependencies: { typescript: "^5.6.0" },
      }),
      "tsconfig.json": "{}",
    });
    const result = await detectStack(TMP);
    expect(result.languageVersion).toBe("5.6.0");
  });

  it("strips ~ prefix from TypeScript version", async () => {
    setup({
      "package.json": JSON.stringify({
        devDependencies: { typescript: "~5.4.2" },
      }),
      "tsconfig.json": "{}",
    });
    const result = await detectStack(TMP);
    expect(result.languageVersion).toBe("5.4.2");
  });

  it("strips >= prefix from TypeScript version", async () => {
    setup({
      "package.json": JSON.stringify({
        devDependencies: { typescript: ">=5.0.0" },
      }),
      "tsconfig.json": "{}",
    });
    const result = await detectStack(TMP);
    expect(result.languageVersion).toBe("5.0.0");
  });

  it("handles exact TypeScript version (no prefix)", async () => {
    setup({
      "package.json": JSON.stringify({
        devDependencies: { typescript: "5.5.0" },
      }),
      "tsconfig.json": "{}",
    });
    const result = await detectStack(TMP);
    expect(result.languageVersion).toBe("5.5.0");
  });

  it("runtimeVersion is null when no Node version source exists", async () => {
    setup({
      "package.json": JSON.stringify({
        devDependencies: { typescript: "5.5.0" },
      }),
      "tsconfig.json": "{}",
    });
    const result = await detectStack(TMP);
    expect(result.runtimeVersion).toBeNull();
  });

  it("plain JS uses Node version as languageVersion", async () => {
    setup({
      "package.json": JSON.stringify({
        dependencies: { express: "4.19.0" },
      }),
      ".nvmrc": "18.19.0",
    });
    const result = await detectStack(TMP);
    expect(result.language).toBe("javascript");
    expect(result.languageVersion).toBe("18.19.0");
    expect(result.runtimeVersion).toBe("18.19.0");
  });

  it("prefers .nvmrc over .node-version", async () => {
    setup({
      "package.json": JSON.stringify({
        devDependencies: { typescript: "5.5.0" },
      }),
      "tsconfig.json": "{}",
      ".nvmrc": "20",
      ".node-version": "18",
    });
    const result = await detectStack(TMP);
    expect(result.runtimeVersion).toBe("20");
  });

  it("Python runtimeVersion matches languageVersion", async () => {
    setup({
      "requirements.txt": "flask==3.0.0",
      ".python-version": "3.12.0",
    });
    const result = await detectStack(TMP);
    expect(result.languageVersion).toBe("3.12.0");
    expect(result.runtimeVersion).toBe("3.12.0");
  });

  it("Go runtimeVersion matches languageVersion", async () => {
    setup({
      "go.mod": "module example.com/app\n\ngo 1.22\n",
    });
    const result = await detectStack(TMP);
    expect(result.languageVersion).toBe("1.22");
    expect(result.runtimeVersion).toBe("1.22");
  });

  it("Ruby runtimeVersion matches languageVersion", async () => {
    setup({
      Gemfile: 'source "https://rubygems.org"\ngem "rails", "~> 7.2"',
      ".ruby-version": "3.3.0",
    });
    const result = await detectStack(TMP);
    expect(result.languageVersion).toBe("3.3.0");
    expect(result.runtimeVersion).toBe("3.3.0");
  });

  it("runtimeVersion is null when no version file exists for non-JS", async () => {
    setup({
      "requirements.txt": "flask==3.0.0",
    });
    const result = await detectStack(TMP);
    expect(result.languageVersion).toBeNull();
    expect(result.runtimeVersion).toBeNull();
  });
});
