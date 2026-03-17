/**
 * Tests for new framework/language fixtures (v0.8.0 expansion)
 *
 * Tests integration of dotnet, kotlin, flutter, deno, bun, swift
 * fixtures through the full analysis pipeline.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { analyzeCodebase } from "../../src/analyzers/index.js";
import { renderClaudeMd } from "../../src/core/generate.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

// Helper to check if a fixture exists before testing
function describeFixture(name: string, dir: string, fn: () => void) {
  const fullPath = join(FIXTURES, dir);
  if (existsSync(fullPath)) {
    describe(name, fn);
  } else {
    describe.skip(`${name} (fixture not yet created)`, fn);
  }
}

// ─── C# / .NET ─────────────────────────────────────────────

describeFixture("dotnet-app fixture", "dotnet-app", () => {
  it("detects C# language and .NET framework", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "dotnet-app"),
      skipGit: true,
    });

    expect(profile.stack.language).toBe("csharp");
    expect(profile.stack.framework).toBe("dotnet");
    expect(profile.stack.runtime).toBe("dotnet");
    expect(profile.stack.packageManager).toBe("nuget");
  });

  it("detects .NET version from .csproj", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "dotnet-app"),
      skipGit: true,
    });

    expect(profile.stack.languageVersion).toMatch(/^net\d/);
  });

  it("detects NuGet package references", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "dotnet-app"),
      skipGit: true,
    });

    expect(Object.keys(profile.stack.keyDeps).length).toBeGreaterThan(0);
  });

  it("generates valid CLAUDE.md with C# context", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "dotnet-app"),
      skipGit: true,
    });

    const rendered = renderClaudeMd(profile);
    expect(rendered).toContain("Csharp");
    expect(rendered).toContain("Dotnet");
  });

  it("detects Docker when Dockerfile is present", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "dotnet-app"),
      skipGit: true,
    });

    expect(profile.environment.hasDocker || profile.cicd.hasDocker).toBe(true);
  });
});

// ─── Kotlin / Ktor ──────────────────────────────────────────

describeFixture("kotlin-app fixture", "kotlin-app", () => {
  it("detects Kotlin language and Ktor framework", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "kotlin-app"),
      skipGit: true,
    });

    expect(profile.stack.language).toBe("kotlin");
    expect(profile.stack.framework).toBe("ktor");
    expect(profile.stack.runtime).toBe("jvm");
    expect(profile.stack.packageManager).toBe("gradle");
  });

  it("detects Kotlin dependencies from build.gradle.kts", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "kotlin-app"),
      skipGit: true,
    });

    expect(Object.keys(profile.stack.keyDeps).length).toBeGreaterThan(0);
  });

  it("generates valid CLAUDE.md with Kotlin context", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "kotlin-app"),
      skipGit: true,
    });

    const rendered = renderClaudeMd(profile);
    expect(rendered).toContain("Kotlin");
    expect(rendered).toContain("Ktor");
  });

  it("detects environment variables from .env.example", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "kotlin-app"),
      skipGit: true,
    });

    expect(profile.environment.envVars.length).toBeGreaterThan(0);
  });
});

// ─── Dart / Flutter ─────────────────────────────────────────

describeFixture("flutter-app fixture", "flutter-app", () => {
  it("detects Dart language and Flutter framework", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "flutter-app"),
      skipGit: true,
    });

    expect(profile.stack.language).toBe("dart");
    expect(profile.stack.framework).toBe("flutter");
    expect(profile.stack.runtime).toBe("dart");
    expect(profile.stack.packageManager).toBe("pub");
  });

  it("parses dependencies from pubspec.yaml", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "flutter-app"),
      skipGit: true,
    });

    expect(Object.keys(profile.stack.keyDeps).length).toBeGreaterThan(0);
  });

  it("generates valid CLAUDE.md with Flutter context", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "flutter-app"),
      skipGit: true,
    });

    const rendered = renderClaudeMd(profile);
    expect(rendered).toContain("Dart");
    expect(rendered).toContain("Flutter");
  });
});

// ─── Deno / Fresh ───────────────────────────────────────────

describeFixture("deno-app fixture", "deno-app", () => {
  it("detects TypeScript language with Deno runtime", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "deno-app"),
      skipGit: true,
    });

    expect(profile.stack.language).toBe("typescript");
    expect(profile.stack.runtime).toBe("deno");
    expect(profile.stack.packageManager).toBe("deno");
  });

  it("detects Fresh framework from imports", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "deno-app"),
      skipGit: true,
    });

    expect(profile.stack.framework).toBe("fresh");
  });

  it("parses import map from deno.json", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "deno-app"),
      skipGit: true,
    });

    expect(Object.keys(profile.stack.keyDeps).length).toBeGreaterThan(0);
  });

  it("generates valid CLAUDE.md", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "deno-app"),
      skipGit: true,
    });

    const rendered = renderClaudeMd(profile);
    expect(rendered).toContain("Typescript");
    expect(rendered).toContain("Fresh");
  });
});

// ─── Bun / Elysia ──────────────────────────────────────────

describeFixture("bun-app fixture", "bun-app", () => {
  it("detects TypeScript language with Bun runtime", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "bun-app"),
      skipGit: true,
    });

    expect(profile.stack.language).toBe("typescript");
    expect(profile.stack.runtime).toBe("bun");
    expect(profile.stack.packageManager).toBe("bun");
  });

  it("detects Elysia framework", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "bun-app"),
      skipGit: true,
    });

    expect(profile.stack.framework).toBe("elysia");
  });

  it("parses dependencies from package.json", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "bun-app"),
      skipGit: true,
    });

    expect(profile.stack.keyDeps["elysia"]).toBeDefined();
  });

  it("generates valid CLAUDE.md with Elysia context", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "bun-app"),
      skipGit: true,
    });

    const rendered = renderClaudeMd(profile);
    expect(rendered).toContain("Typescript");
    expect(rendered).toContain("Elysia");
  });
});

// ─── Swift / Vapor ──────────────────────────────────────────

describeFixture("swift-app fixture", "swift-app", () => {
  it("detects Swift language and Vapor framework", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "swift-app"),
      skipGit: true,
    });

    expect(profile.stack.language).toBe("swift");
    expect(profile.stack.framework).toBe("vapor");
    expect(profile.stack.runtime).toBe("swift");
    expect(profile.stack.packageManager).toBe("spm");
  });

  it("parses Package.swift dependencies", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "swift-app"),
      skipGit: true,
    });

    expect(Object.keys(profile.stack.keyDeps).length).toBeGreaterThan(0);
    expect(profile.stack.keyDeps["vapor"]).toBeDefined();
  });

  it("detects swift-tools-version", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "swift-app"),
      skipGit: true,
    });

    expect(profile.stack.languageVersion).toMatch(/^\d+\.\d+/);
  });

  it("generates valid CLAUDE.md with Vapor context", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "swift-app"),
      skipGit: true,
    });

    const rendered = renderClaudeMd(profile);
    expect(rendered).toContain("Swift");
    expect(rendered).toContain("Vapor");
  });

  it("detects Docker Compose when present", async () => {
    const profile = await analyzeCodebase({
      rootDir: join(FIXTURES, "swift-app"),
      skipGit: true,
    });

    expect(
      profile.environment.hasDockerCompose || profile.cicd.hasDockerCompose
    ).toBe(true);
  });
});
