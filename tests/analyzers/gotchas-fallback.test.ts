import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { analyzeGotchas } from "../../src/analyzers/gotchas.js";
import type { StackProfile } from "../../src/analyzers/stack-detector.js";

const TMP = join(process.cwd(), "tests/fixtures/.tmp-gotchas");

function setup(files: Record<string, string>) {
  mkdirSync(TMP, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const full = join(TMP, path);
    mkdirSync(full.substring(0, full.lastIndexOf("/")), { recursive: true });
    writeFileSync(full, content);
  }
}

afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("Gotchas — TypeScript/JS fallback", () => {
  it("adds TypeScript fallback gotchas for generic TS projects", async () => {
    setup({
      "tsconfig.json": JSON.stringify({ compilerOptions: { target: "es2022" } }),
    });
    const stack: StackProfile = {
      language: "typescript",
      framework: "unknown",
      languageVersion: "5.5.0",
      runtimeVersion: "20",
      frameworkVersion: null,
      runtime: "node",
      packageManager: "npm",
      monorepo: false,
      keyDeps: {},
    };
    const result = await analyzeGotchas(TMP, stack);
    const rules = result.gotchas.map((g) => g.rule);
    expect(rules).toContain("DON'T use `any` — prefer `unknown` with type narrowing");
    expect(rules).toContain("ALWAYS use .js extension in ESM import paths");
  });

  it("adds strict mode gotcha when tsconfig lacks strict", async () => {
    setup({
      "tsconfig.json": JSON.stringify({ compilerOptions: { target: "es2022" } }),
    });
    const stack: StackProfile = {
      language: "typescript",
      framework: "unknown",
      languageVersion: "5.5.0",
      runtimeVersion: null,
      frameworkVersion: null,
      runtime: "node",
      packageManager: "npm",
      monorepo: false,
      keyDeps: {},
    };
    const result = await analyzeGotchas(TMP, stack);
    const rules = result.gotchas.map((g) => g.rule);
    expect(rules).toContain("ALWAYS enable strict mode in tsconfig.json");
  });

  it("does NOT add strict mode gotcha when tsconfig has strict", async () => {
    setup({
      "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
    });
    const stack: StackProfile = {
      language: "typescript",
      framework: "unknown",
      languageVersion: "5.5.0",
      runtimeVersion: null,
      frameworkVersion: null,
      runtime: "node",
      packageManager: "npm",
      monorepo: false,
      keyDeps: {},
    };
    const result = await analyzeGotchas(TMP, stack);
    const rules = result.gotchas.map((g) => g.rule);
    expect(rules).not.toContain("ALWAYS enable strict mode in tsconfig.json");
  });

  it("does NOT add TS fallback when framework gotchas exist (Next.js)", async () => {
    setup({});
    const stack: StackProfile = {
      language: "typescript",
      framework: "nextjs",
      languageVersion: "5.5.0",
      runtimeVersion: "20",
      frameworkVersion: "14.0.0",
      runtime: "node",
      packageManager: "npm",
      monorepo: false,
      keyDeps: {},
    };
    const result = await analyzeGotchas(TMP, stack);
    const rules = result.gotchas.map((g) => g.rule);
    // Next.js has its own gotchas, so TS fallback should NOT fire
    expect(rules).not.toContain("DON'T use `any` — prefer `unknown` with type narrowing");
  });

  it("does NOT add TS fallback when Go gotchas exist", async () => {
    setup({});
    const stack: StackProfile = {
      language: "go",
      framework: "gin",
      languageVersion: "1.22",
      runtimeVersion: "1.22",
      frameworkVersion: null,
      runtime: "go",
      packageManager: "go modules",
      monorepo: false,
      keyDeps: {},
    };
    const result = await analyzeGotchas(TMP, stack);
    const rules = result.gotchas.map((g) => g.rule);
    expect(rules).not.toContain("DON'T use `any` — prefer `unknown` with type narrowing");
    // Go has its own gotchas
    expect(rules).toContain("DON'T ignore errors — always check returned error values");
  });

  it("adds JavaScript fallback gotcha for generic JS projects", async () => {
    setup({});
    const stack: StackProfile = {
      language: "javascript",
      framework: "unknown",
      languageVersion: "18",
      runtimeVersion: "18",
      frameworkVersion: null,
      runtime: "node",
      packageManager: "npm",
      monorepo: false,
      keyDeps: {},
    };
    const result = await analyzeGotchas(TMP, stack);
    const rules = result.gotchas.map((g) => g.rule);
    expect(rules).toContain("ALWAYS use strict mode or ESM modules");
  });

  it("does NOT add JS fallback when Express gotchas would exist (but Express has none, so fallback fires)", async () => {
    // Express doesn't have framework-specific gotchas in gotchas.ts
    // so the JS fallback should still fire
    setup({});
    const stack: StackProfile = {
      language: "javascript",
      framework: "express",
      languageVersion: "18",
      runtimeVersion: "18",
      frameworkVersion: "4.19.0",
      runtime: "node",
      packageManager: "npm",
      monorepo: false,
      keyDeps: {},
    };
    const result = await analyzeGotchas(TMP, stack);
    const rules = result.gotchas.map((g) => g.rule);
    expect(rules).toContain("ALWAYS use strict mode or ESM modules");
  });
});
