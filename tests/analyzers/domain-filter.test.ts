import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { analyzeDomains } from "../../src/analyzers/domain-analyzer.js";
import type { StackProfile } from "../../src/analyzers/stack-detector.js";

const TMP = join(process.cwd(), "tests/fixtures/.tmp-domain");

function setup(files: Record<string, string>) {
  mkdirSync(TMP, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const full = join(TMP, path);
    mkdirSync(full.substring(0, full.lastIndexOf("/")), { recursive: true });
    writeFileSync(full, content);
  }
}

afterEach(() => rmSync(TMP, { recursive: true, force: true }));

function tsCliStack(): StackProfile {
  return {
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
}

function railsAppStack(): StackProfile {
  return {
    language: "ruby",
    framework: "rails",
    languageVersion: "3.3.0",
    runtimeVersion: "3.3.0",
    frameworkVersion: "7.2.0",
    runtime: "ruby",
    packageManager: "bundler",
    monorepo: false,
    keyDeps: { rails: "7.2.0" },
  };
}

describe("Domain analyzer — false positive filtering", () => {
  it("filters out infra path parts for non-application projects", async () => {
    setup({
      "src/config/settings.ts": "export const settings = {};",
      "src/token/parser.ts": "export function parse() {}",
      "src/core/engine.ts": "export function run() {}",
      "src/utils/helpers.ts": "export function help() {}",
      "src/lib/shared.ts": "export const shared = {};",
    });
    const result = await analyzeDomains(TMP, tsCliStack());
    const names = result.domains.map((d) => d.name);
    expect(names).not.toContain("Configuration");
    expect(names).not.toContain("Token management");
  });

  it("filters out user/account domains for non-application projects", async () => {
    setup({
      "src/user/types.ts": "export interface User {}",
      "src/account/manager.ts": "export function manage() {}",
      "src/page/renderer.ts": "export function render() {}",
    });
    const result = await analyzeDomains(TMP, tsCliStack());
    const names = result.domains.map((d) => d.name);
    expect(names).not.toContain("User management");
    expect(names).not.toContain("Account management");
    expect(names).not.toContain("Pages / CMS");
  });

  it("keeps user/account domains for application projects with controllers", async () => {
    setup({
      "app/models/user.rb": "class User < ApplicationRecord\nend",
      "app/models/post.rb": "class Post < ApplicationRecord\nend",
      "app/models/comment.rb": "class Comment < ApplicationRecord\nend",
      "app/controllers/users_controller.rb": "class UsersController < ApplicationController\nend",
      "app/controllers/posts_controller.rb": "class PostsController < ApplicationController\nend",
      "routes/web.rb": "resources :users",
      "app/views/users/index.html.erb": "<h1>Users</h1>",
      "app/views/users/show.html.erb": "<h1>User</h1>",
    });
    const result = await analyzeDomains(TMP, railsAppStack());
    const names = result.domains.map((d) => d.name);
    // isApplication = true (controllers > 0), user not in INFRA_PATH_PARTS filter
    expect(names).toContain("User management");
  });

  it("filters domains with < 3 files for non-application projects", async () => {
    setup({
      "src/auth/login.ts": "export function login() {}",
      "src/auth/register.ts": "export function register() {}",
      // Only 2 files — should be filtered
    });
    const result = await analyzeDomains(TMP, tsCliStack());
    const names = result.domains.map((d) => d.name);
    expect(names).not.toContain("Authentication & authorization");
  });

  it("keeps domains with >= 3 files for non-application projects", async () => {
    setup({
      "src/auth/login.ts": "export function login() {}",
      "src/auth/register.ts": "export function register() {}",
      "src/auth/session.ts": "export function session() {}",
      "src/auth/middleware.ts": "export function authMiddleware() {}",
    });
    const result = await analyzeDomains(TMP, tsCliStack());
    const names = result.domains.map((d) => d.name);
    expect(names).toContain("Authentication & authorization");
  });

  it("produces empty domains for a pure CLI tool project", async () => {
    setup({
      "src/cli/index.ts": "export function main() {}",
      "src/core/generate.ts": "export function generate() {}",
      "src/analyzers/stack.ts": "export function detect() {}",
      "src/linter/rules.ts": "export function lint() {}",
      "src/config/defaults.ts": "export const defaults = {};",
    });
    const result = await analyzeDomains(TMP, tsCliStack());
    expect(result.domains.length).toBe(0);
  });

  it("isApplication is true when project has controllers", async () => {
    setup({
      "app/controllers/home_controller.rb": "class HomeController\nend",
      "app/controllers/users_controller.rb": "class UsersController\nend",
      "app/models/user.rb": "class User < ApplicationRecord\nend",
      "app/views/users/index.html.erb": "<h1>Users</h1>",
      "app/views/users/show.html.erb": "<h1>User</h1>",
      "app/views/users/edit.html.erb": "<h1>Edit User</h1>",
    });
    const result = await analyzeDomains(TMP, railsAppStack());
    // isApplication should be true (controllers > 0), so user domain survives
    const names = result.domains.map((d) => d.name);
    expect(names).toContain("User management");
  });

  it("isApplication boundary: 2 models is NOT enough", async () => {
    setup({
      "src/models/user.ts": "export interface User {}",
      "src/models/post.ts": "export interface Post {}",
      "src/user/service.ts": "export function userService() {}",
    });
    // 2 models, no routes, no controllers — not an application
    const result = await analyzeDomains(TMP, tsCliStack());
    const names = result.domains.map((d) => d.name);
    // "user" is in INFRA_PATH_PARTS so should be filtered for non-apps
    expect(names).not.toContain("User management");
  });

  it("isApplication boundary: 3 models IS enough", async () => {
    setup({
      "src/models/user.ts": "export interface User {}",
      "src/models/post.ts": "export interface Post {}",
      "src/models/comment.ts": "export interface Comment {}",
      "src/user/service.ts": "export function userService() {}",
      "src/user/controller.ts": "export function userController() {}",
      "src/user/routes.ts": "export function userRoutes() {}",
    });
    // 3 models — isApplication = true, user domain should survive
    const result = await analyzeDomains(TMP, tsCliStack());
    const names = result.domains.map((d) => d.name);
    expect(names).toContain("User management");
  });
});
