import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { detectStack } from "../../src/analyzers/stack-detector.js";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/.tmp-test");

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

describe("Stack Detector", () => {
  afterEach(cleanup);

  describe("Rails detection", () => {
    it("detects a Rails project from Gemfile", async () => {
      setupFixture({
        Gemfile: `
          source "https://rubygems.org"
          ruby "3.3.0"
          gem "rails", "~> 7.2"
          gem "pg"
          gem "sidekiq"
          gem "devise"
          gem "pundit"
          gem "turbo-rails"
          gem "stimulus-rails"
        `,
        ".ruby-version": "3.3.0",
      });

      const result = await detectStack(FIXTURE_DIR);

      expect(result.language).toBe("ruby");
      expect(result.framework).toBe("rails");
      expect(result.languageVersion).toBe("3.3.0");
      expect(result.runtime).toBe("ruby");
      expect(result.packageManager).toBe("bundler");
      expect(result.keyDeps["rails"]).toBe("~> 7.2");
      expect(result.keyDeps["sidekiq"]).toBeDefined();
      expect(result.keyDeps["devise"]).toBeDefined();
    });
  });

  describe("Next.js detection", () => {
    it("detects a Next.js TypeScript project", async () => {
      setupFixture({
        "package.json": JSON.stringify({
          name: "my-nextjs-app",
          dependencies: {
            next: "14.2.0",
            react: "18.3.0",
            "react-dom": "18.3.0",
          },
          devDependencies: {
            typescript: "5.5.0",
            "@types/react": "18.3.0",
          },
        }),
        "tsconfig.json": "{}",
        "pnpm-lock.yaml": "",
      });

      const result = await detectStack(FIXTURE_DIR);

      expect(result.language).toBe("typescript");
      expect(result.framework).toBe("nextjs");
      expect(result.frameworkVersion).toBe("14.2.0");
      expect(result.languageVersion).toBe("5.5.0");
      expect(result.runtimeVersion).toBeNull();
      expect(result.runtime).toBe("node");
      expect(result.packageManager).toBe("pnpm");
    });
  });

  describe("Express detection", () => {
    it("detects an Express JS project with npm", async () => {
      setupFixture({
        "package.json": JSON.stringify({
          name: "my-api",
          dependencies: {
            express: "4.19.0",
          },
        }),
        "package-lock.json": "{}",
      });

      const result = await detectStack(FIXTURE_DIR);

      expect(result.language).toBe("javascript");
      expect(result.framework).toBe("express");
      expect(result.packageManager).toBe("npm");
    });
  });

  describe("Python/Django detection", () => {
    it("detects a Django project from requirements.txt", async () => {
      setupFixture({
        "requirements.txt": "django==5.0\npsycopg2==2.9.9\ncelery==5.4.0",
        ".python-version": "3.12.0",
      });

      const result = await detectStack(FIXTURE_DIR);

      expect(result.language).toBe("python");
      expect(result.framework).toBe("django");
      expect(result.runtime).toBe("python");
      expect(result.languageVersion).toBe("3.12.0");
    });
  });

  describe("Go detection", () => {
    it("detects a Go project with Gin", async () => {
      setupFixture({
        "go.mod": `module example.com/myapp\n\ngo 1.22\n\nrequire github.com/gin-gonic/gin v1.10.0`,
      });

      const result = await detectStack(FIXTURE_DIR);

      expect(result.language).toBe("go");
      expect(result.framework).toBe("gin");
      expect(result.languageVersion).toBe("1.22");
    });
  });

  describe("Monorepo detection", () => {
    it("detects pnpm workspace monorepo", async () => {
      setupFixture({
        "package.json": JSON.stringify({ name: "monorepo" }),
        "pnpm-workspace.yaml": "packages:\n  - apps/*\n  - packages/*",
        "pnpm-lock.yaml": "",
      });

      const result = await detectStack(FIXTURE_DIR);

      expect(result.monorepo).toBe(true);
    });

    it("detects npm workspaces monorepo", async () => {
      setupFixture({
        "package.json": JSON.stringify({
          name: "monorepo",
          workspaces: ["packages/*"],
        }),
      });

      const result = await detectStack(FIXTURE_DIR);

      expect(result.monorepo).toBe(true);
    });
  });

  describe("Framework override", () => {
    it("respects forced framework", async () => {
      setupFixture({
        "package.json": JSON.stringify({
          dependencies: { express: "4.19.0" },
        }),
      });

      const result = await detectStack(FIXTURE_DIR, "fastify");

      expect(result.framework).toBe("fastify");
    });
  });
});
