import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { scanFiles } from "../../src/analyzers/file-scanner.js";
import { readBatch } from "../../src/analyzers/file-reader.js";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/.tmp-scanner-test");

function setupFixture(files: Record<string, string>) {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(FIXTURE_DIR, path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
  }
}

function cleanup() {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

// ─── scanFiles tests ─────────────────────────────────────────

describe("File Scanner", () => {
  afterEach(cleanup);

  describe("Next.js fixture", () => {
    const NEXTJS_FIXTURE = join(process.cwd(), "tests/fixtures/nextjs-app");

    it("categorizes pages, components, and utilities", () => {
      const result = scanFiles(NEXTJS_FIXTURE, undefined, "nextjs");

      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.categories.pages).toBeDefined();
      expect(result.categories.pages.files.some((f: string) => f.includes("page.tsx"))).toBe(true);
      expect(result.categories.components).toBeDefined();
      expect(result.categories.components.files.some((f: string) => f.includes("Header.tsx"))).toBe(true);
    });
  });

  describe("Rails fixture", () => {
    const RAILS_FIXTURE = join(process.cwd(), "tests/fixtures/rails-app");

    it("categorizes models, controllers, services, and policies", () => {
      const result = scanFiles(RAILS_FIXTURE, undefined, "rails");

      expect(result.categories.models).toBeDefined();
      expect(result.categories.models.files.some((f: string) => f.includes("user.rb"))).toBe(true);
      expect(result.categories.controllers).toBeDefined();
      expect(result.categories.services).toBeDefined();
      expect(result.categories.middleware).toBeDefined();
      expect(result.categories.middleware.files.some((f: string) => f.includes("policies/"))).toBe(true);
    });
  });

  describe("FastAPI fixture", () => {
    const FASTAPI_FIXTURE = join(process.cwd(), "tests/fixtures/fastapi-app");

    it("categorizes models, schemas, routes, and tests", () => {
      const result = scanFiles(FASTAPI_FIXTURE, undefined, "fastapi");

      expect(result.categories.models).toBeDefined();
      expect(result.categories.schemas).toBeDefined();
      expect(result.categories.routes).toBeDefined();
      expect(result.categories.tests).toBeDefined();
    });
  });

  describe("Monorepo fixture", () => {
    const MONOREPO_FIXTURE = join(process.cwd(), "tests/fixtures/monorepo-app");

    it("walks into packages/*/src/", () => {
      const result = scanFiles(MONOREPO_FIXTURE);

      expect(result.totalFiles).toBeGreaterThan(0);
      // Should find files inside packages
      const allFiles = Object.values(result.categories).flatMap((c) => c.files);
      const uncategorized = result.uncategorized;
      const allFound = [...allFiles, ...uncategorized];
      expect(allFound.some((f) => f.includes("packages/"))).toBe(true);
    });
  });

  describe("Minimal fixture", () => {
    const MINIMAL_FIXTURE = join(process.cwd(), "tests/fixtures/minimal-app");

    it("handles sparse projects gracefully", () => {
      const result = scanFiles(MINIMAL_FIXTURE);

      expect(result.totalFiles).toBeGreaterThanOrEqual(1);
      expect(result.truncated).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("respects exclude parameter", () => {
      setupFixture({
        "src/index.ts": "export {}",
        "vendor/lib.js": "module.exports = {}",
        "custom-ignore/data.ts": "export {}",
      });

      const result = scanFiles(FIXTURE_DIR, ["custom-ignore"]);

      const allFiles = [
        ...Object.values(result.categories).flatMap((c) => c.files),
        ...result.uncategorized,
      ];
      expect(allFiles.some((f) => f.includes("custom-ignore"))).toBe(false);
    });

    it("tracks uncategorized files", () => {
      setupFixture({
        "README.txt": "Hello",
        "random.xyz": "data",
      });

      const result = scanFiles(FIXTURE_DIR);
      // At least one file should end up uncategorized (random.xyz has no matching rule)
      const allCategorized = Object.values(result.categories).flatMap((c) => c.files);
      expect(result.totalFiles).toBe(allCategorized.length + result.uncategorized.length);
    });

    it("classifies files by directory name", () => {
      setupFixture({
        "components/Button.tsx": "export {}",
        "hooks/useAuth.ts": "export {}",
        "models/User.ts": "export {}",
        "tests/app.test.ts": "test()",
        "config/settings.ts": "export {}",
      });

      const result = scanFiles(FIXTURE_DIR);

      expect(result.categories.components?.count).toBe(1);
      expect(result.categories.hooks?.count).toBe(1);
      expect(result.categories.models?.count).toBe(1);
      expect(result.categories.tests?.count).toBe(1);
      expect(result.categories.config?.count).toBe(1);
    });

    it("classifies files by naming convention", () => {
      setupFixture({
        "src/app.test.ts": "test()",
        "src/app.spec.js": "test()",
        "src/vite.config.ts": "export default {}",
        "src/types.d.ts": "declare {}",
        "src/main.css": "body {}",
        "src/deploy.sh": "#!/bin/bash",
        "src/notes.md": "# Notes",
      });

      const result = scanFiles(FIXTURE_DIR);

      expect(result.categories.tests?.count).toBeGreaterThanOrEqual(2);
      expect(result.categories.config?.count).toBeGreaterThanOrEqual(1);
      expect(result.categories.types?.count).toBeGreaterThanOrEqual(1);
      expect(result.categories.styles?.count).toBeGreaterThanOrEqual(1);
      expect(result.categories.scripts?.count).toBeGreaterThanOrEqual(1);
      expect(result.categories.docs?.count).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── readBatch tests ─────────────────────────────────────────

describe("File Reader", () => {
  afterEach(cleanup);

  it("reads files with correct content, lines, and language", () => {
    setupFixture({
      "src/index.ts": "const a = 1;\nconst b = 2;\nconst c = 3;\n",
      "src/utils.py": "def hello():\n    pass\n",
      "README.md": "# Hello\n",
    });

    const result = readBatch(FIXTURE_DIR, [
      "src/index.ts",
      "src/utils.py",
      "README.md",
    ]);

    expect(result.files).toHaveLength(3);
    expect(result.errors).toHaveLength(0);

    const tsFile = result.files.find((f) => f.path === "src/index.ts")!;
    expect(tsFile.language).toBe("typescript");
    expect(tsFile.lines).toBe(4);
    expect(tsFile.truncated).toBe(false);
    expect(tsFile.content).toContain("const a = 1;");

    const pyFile = result.files.find((f) => f.path === "src/utils.py")!;
    expect(pyFile.language).toBe("python");

    const mdFile = result.files.find((f) => f.path === "README.md")!;
    expect(mdFile.language).toBe("markdown");
  });

  it("truncates files exceeding maxLinesPerFile", () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join("\n");
    setupFixture({ "big.ts": lines });

    const result = readBatch(FIXTURE_DIR, ["big.ts"], 200);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].truncated).toBe(true);
    expect(result.files[0].lines).toBe(300);
    expect(result.files[0].content.split("\n")).toHaveLength(200);
  });

  it("rejects path traversal attempts", () => {
    setupFixture({ "src/ok.ts": "ok" });

    const result = readBatch(FIXTURE_DIR, ["../../package.json"]);

    expect(result.files).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Path traversal rejected");
  });

  it("skips binary files", () => {
    setupFixture({ "data.bin": "" });
    // Overwrite with actual binary content containing null bytes
    writeFileSync(join(FIXTURE_DIR, "data.bin"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));

    const result = readBatch(FIXTURE_DIR, ["data.bin"]);

    expect(result.files).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toBe("Binary file skipped");
  });

  it("throws when file count exceeds limit", () => {
    setupFixture({ "a.ts": "x" });
    const files = Array.from({ length: 21 }, (_, i) => `file${i}.ts`);

    expect(() => readBatch(FIXTURE_DIR, files)).toThrow(
      /exceeds limit of 20/
    );
  });

  it("detects language from file extensions", () => {
    setupFixture({
      "app.go": "package main",
      "lib.rb": "class Foo; end",
      "App.java": "class App {}",
      "main.rs": "fn main() {}",
    });

    const result = readBatch(FIXTURE_DIR, [
      "app.go",
      "lib.rb",
      "App.java",
      "main.rs",
    ]);

    expect(result.files.find((f) => f.path === "app.go")!.language).toBe("go");
    expect(result.files.find((f) => f.path === "lib.rb")!.language).toBe("ruby");
    expect(result.files.find((f) => f.path === "App.java")!.language).toBe("java");
    expect(result.files.find((f) => f.path === "main.rs")!.language).toBe("rust");
  });

  it("warns about sensitive files but still reads them", () => {
    setupFixture({
      ".env": "SECRET=abc123",
      "certs/server.key": "-----BEGIN RSA PRIVATE KEY-----",
    });

    const result = readBatch(FIXTURE_DIR, [".env", "certs/server.key"]);

    expect(result.files).toHaveLength(2);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("Sensitive file");
  });

  it("handles missing files gracefully", () => {
    setupFixture({ "exists.ts": "ok" });

    const result = readBatch(FIXTURE_DIR, ["exists.ts", "missing.ts"]);

    expect(result.files).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toBe("File not found");
  });
});
