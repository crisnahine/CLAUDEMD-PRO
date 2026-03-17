import { describe, it, expect } from "vitest";
import { buildContext, runRules } from "../../src/linter/index.js";

describe("stale-ref rule edge cases", () => {
  const rootDir = process.cwd();

  it("detects absolute path references to non-existent dirs", () => {
    const content = "Check /src/nonexistent-dir-12345/ for details";
    const ctx = buildContext(content, rootDir);
    const results = runRules(ctx, { rules: ["stale-ref"] });
    expect(results.length).toBeGreaterThan(0);
  });

  it("passes for paths that actually exist", () => {
    const content = "The source code is in /src/linter/rules/ directory";
    const ctx = buildContext(content, rootDir);
    const results = runRules(ctx, { rules: ["stale-ref"] });
    expect(results).toHaveLength(0);
  });

  it("detects backtick-wrapped paths", () => {
    const content = "See `src/nonexistent-thing-xyz/foo.ts` for details";
    const ctx = buildContext(content, rootDir);
    const results = runRules(ctx, { rules: ["stale-ref"] });
    expect(results.length).toBeGreaterThan(0);
  });

  it("skips URLs (http/https)", () => {
    const content = "See https://example.com/src/foo for docs";
    const ctx = buildContext(content, rootDir);
    const results = runRules(ctx, { rules: ["stale-ref"] });
    expect(results).toHaveLength(0);
  });

  it("skips paths inside fenced code blocks", () => {
    const content = "```\n/src/definitely-not-a-real-dir/foo.ts\n```";
    const ctx = buildContext(content, rootDir);
    const results = runRules(ctx, { rules: ["stale-ref"] });
    expect(results).toHaveLength(0);
  });

  it("handles relative paths with known prefixes in backticks", () => {
    const content = "Config in `config/nonexistent-xyz-123/database.yml`";
    const ctx = buildContext(content, rootDir);
    const results = runRules(ctx, { rules: ["stale-ref"] });
    expect(results.length).toBeGreaterThan(0);
  });

  it("does not flag single-segment paths", () => {
    // Single segment with no / shouldn't be treated as a path
    const content = "Use the `src` directory";
    const ctx = buildContext(content, rootDir);
    const results = runRules(ctx, { rules: ["stale-ref"] });
    expect(results).toHaveLength(0);
  });

  it("detects expanded prefixes (internal, cmd, api, etc.)", () => {
    const content = "See /internal/nonexistent-xyz/ and /api/nonexistent-abc/ dirs";
    const ctx = buildContext(content, rootDir);
    const results = runRules(ctx, { rules: ["stale-ref"] });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("does not duplicate findings for the same path", () => {
    const content = "Use /src/fake-12345/ here and /src/fake-12345/ there";
    const ctx = buildContext(content, rootDir);
    const results = runRules(ctx, { rules: ["stale-ref"] });
    // Should deduplicate
    const unique = new Set(results.map((r) => r.message));
    expect(unique.size).toBe(results.length);
  });
});
