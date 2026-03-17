/**
 * Drift Detection Engine
 *
 * Re-analyzes the codebase and compares against an existing CLAUDE.md
 * to find staleness, missing content, and changed configuration.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeCodebase } from "../analyzers/index.js";
import type { ArchitectureProfile } from "../analyzers/architecture.js";
import type { CommandsProfile } from "../analyzers/commands.js";
import type { GotchasProfile } from "../analyzers/gotchas.js";
import type { StackProfile } from "../analyzers/stack-detector.js";

// ─── Types ──────────────────────────────────────────────────

export interface DriftItem {
  type: "stale-path" | "missing-dir" | "changed-command" | "new-dep" | "removed-dep" | "framework-change" | "missing-gotcha";
  severity: "critical" | "warning" | "info";
  message: string;
  suggestion: string;
  /** If auto-fixable, the content change to apply */
  autoFix?: { section: string; oldText?: string; newText?: string };
}

export interface DriftReport {
  driftItems: DriftItem[];
  currentScore: number;
  estimatedScoreAfterFix: number;
  lastAnalyzed: string;
}

// ─── Section parser ─────────────────────────────────────────

interface ParsedSection {
  heading: string;
  content: string;
}

function parseSections(content: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = content.split("\n");
  let heading = "";
  let sectionContent = "";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (heading) sections.push({ heading, content: sectionContent });
      heading = line.replace("## ", "").trim();
      sectionContent = "";
    } else {
      sectionContent += line + "\n";
    }
  }
  if (heading) sections.push({ heading, content: sectionContent });

  return sections;
}

// ─── Main detection ─────────────────────────────────────────

export async function detectDrift(
  rootDir: string,
  claudeMdPath: string
): Promise<DriftReport> {
  const content = readFileSync(claudeMdPath, "utf-8");
  const sections = parseSections(content);

  // Re-analyze the codebase
  const profile = await analyzeCodebase({ rootDir });

  const driftItems: DriftItem[] = [];

  // Run all drift detectors
  driftItems.push(...detectStalePaths(content, rootDir));
  driftItems.push(...detectMissingDirs(content, sections, profile.architecture));
  driftItems.push(...detectChangedCommands(content, sections, profile.commands, profile.stack, rootDir));
  driftItems.push(...detectNewDeps(content, profile.stack));
  driftItems.push(...detectRemovedDeps(content, profile.stack));
  driftItems.push(...detectFrameworkChanges(content, profile.stack));
  driftItems.push(...detectMissingGotchas(content, sections, profile.gotchas));

  // Calculate scores
  const currentScore = calculateDriftScore(driftItems);
  const estimatedScoreAfterFix = estimateFixedScore(driftItems);

  return {
    driftItems,
    currentScore,
    estimatedScoreAfterFix,
    lastAnalyzed: new Date().toISOString(),
  };
}

// ─── Drift detectors ────────────────────────────────────────

/**
 * Stale paths: Directories referenced in CLAUDE.md that no longer exist
 */
function detectStalePaths(content: string, rootDir: string): DriftItem[] {
  const items: DriftItem[] = [];

  // Expanded path prefixes — aligned with the stale-ref lint rule
  const prefixes = "src|app|lib|config|test|tests|spec|db|prisma|public|internal|cmd|utils|services|models|helpers|scripts|packages|routes|middleware|api|views|templates|static|assets|components|hooks|stores|pages|resources|migrations|schemas|types|fixtures|factories|vendor|web|docs|tools|deployments|build|dist|proto";
  const pathPattern = new RegExp(`(?:^|\\s|${"\\`"})(\\/?(?:${prefixes})\\/[a-zA-Z0-9_\\-./]*)\\/?(?:\\s|$|${"\\`"})`, "gm");
  let match;

  while ((match = pathPattern.exec(content)) !== null) {
    const refPath = match[1].replace(/^\//, "").replace(/\/+$/, "");
    if (!refPath || refPath.length < 3) continue;

    const fsPath = resolve(rootDir, refPath);
    if (!existsSync(fsPath)) {
      items.push({
        type: "stale-path",
        severity: "critical",
        message: `Referenced path \`/${refPath}/\` no longer exists on disk.`,
        suggestion: `Remove or update the reference to \`/${refPath}/\` in your CLAUDE.md.`,
        autoFix: {
          section: "Architecture",
          oldText: `/${refPath}/`,
        },
      });
    }
  }

  return items;
}

/**
 * Missing directories: New significant directories not mentioned in CLAUDE.md
 */
function detectMissingDirs(
  content: string,
  sections: ParsedSection[],
  architecture: ArchitectureProfile
): DriftItem[] {
  const items: DriftItem[] = [];

  // Only flag dirs with a meaningful file count
  const significantDirs = architecture.topLevelDirs.filter(
    (d) => d.fileCount >= 3
  );

  for (const dir of significantDirs) {
    // Check if this dir path appears anywhere in the CLAUDE.md
    const dirName = dir.path.replace(/\/$/, "");
    const patterns = [
      `/${dirName}/`,
      `/${dirName} `,
      `/${dirName}\``,
      `${dirName}/`,
    ];

    const mentioned = patterns.some((p) => content.includes(p));
    if (!mentioned) {
      items.push({
        type: "missing-dir",
        severity: "warning",
        message: `Directory \`/${dir.path}/\` (${dir.fileCount} files — ${dir.purpose}) is not documented.`,
        suggestion: `Add \`/${dir.path}/\` to the Architecture section with its purpose.`,
        autoFix: {
          section: "Architecture",
          newText: `/${dir.path.padEnd(28)}# ${dir.purpose} (${dir.fileCount} files)`,
        },
      });
    }
  }

  return items;
}

/**
 * Changed commands: package.json scripts that changed since CLAUDE.md was written
 */
function detectChangedCommands(
  content: string,
  sections: ParsedSection[],
  commands: CommandsProfile,
  stack: StackProfile,
  rootDir: string
): DriftItem[] {
  const items: DriftItem[] = [];

  // Detect Makefile target changes
  const makefilePath = join(rootDir, "Makefile");
  if (existsSync(makefilePath)) {
    try {
      const makefile = readFileSync(makefilePath, "utf-8");
      const makeTargets = [...makefile.matchAll(/^([a-zA-Z_][\w-]*):/gm)].map((m) => m[1]);
      for (const target of makeTargets) {
        const makeCmd = `make ${target}`;
        if (content.includes(makeCmd) && !makefile.includes(`${target}:`)) {
          items.push({
            type: "changed-command",
            severity: "critical",
            message: `Command \`${makeCmd}\` is referenced but the Makefile target no longer exists.`,
            suggestion: `Remove or update the reference to \`${makeCmd}\`.`,
          });
        }
      }
    } catch { /* ignore read errors */ }
  }

  // Detect Rakefile task changes (Ruby)
  const rakefilePath = join(rootDir, "Rakefile");
  if (existsSync(rakefilePath)) {
    const rakeRefs = [...content.matchAll(/rake\s+([\w:]+)/g)];
    if (rakeRefs.length > 0) {
      try {
        const rakefile = readFileSync(rakefilePath, "utf-8");
        for (const ref of rakeRefs) {
          const taskName = ref[1];
          if (!rakefile.includes(taskName)) {
            items.push({
              type: "changed-command",
              severity: "warning",
              message: `Rake task \`${taskName}\` is referenced but may not exist in Rakefile.`,
              suggestion: `Verify \`rake ${taskName}\` still exists and update if needed.`,
            });
          }
        }
      } catch { /* ignore read errors */ }
    }
  }

  // Read current package.json scripts
  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) return items;

  let currentScripts: Record<string, string>;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    currentScripts = pkg.scripts ?? {};
  } catch {
    return items;
  }

  const pm = stack.packageManager ?? "npm";

  // Find the Commands section
  const commandsSection = sections.find(
    (s) => s.heading.toLowerCase().includes("command")
  );

  if (!commandsSection) return items;

  // Check for scripts that exist in package.json but are not in the Commands section
  for (const [name, cmd] of Object.entries(currentScripts)) {
    const fullCommand = `${pm} run ${name}`;
    // Check if either the npm run command or just the script name appears
    const isReferenced =
      commandsSection.content.includes(fullCommand) ||
      commandsSection.content.includes(`run ${name}`) ||
      commandsSection.content.includes(`"${name}"`);

    if (!isReferenced) {
      items.push({
        type: "changed-command",
        severity: "info",
        message: `Script \`${pm} run ${name}\` exists in package.json but is not in the Commands section.`,
        suggestion: `Add \`${fullCommand}\` to the Commands section.`,
        autoFix: {
          section: "Commands",
          newText: `${fullCommand.padEnd(35)} # Run ${name}`,
        },
      });
    }
  }

  // Look for commands referenced in CLAUDE.md that don't exist as scripts anymore
  const scriptRefPattern = new RegExp(`${pm}\\s+run\\s+([a-zA-Z0-9:_-]+)`, "g");
  let refMatch;
  while ((refMatch = scriptRefPattern.exec(content)) !== null) {
    const scriptName = refMatch[1];
    if (!(scriptName in currentScripts)) {
      items.push({
        type: "changed-command",
        severity: "critical",
        message: `Command \`${pm} run ${scriptName}\` is referenced but no longer exists in package.json scripts.`,
        suggestion: `Remove or update the reference to \`${pm} run ${scriptName}\`.`,
      });
    }
  }

  return items;
}

/**
 * New dependencies: Significant new deps not mentioned in CLAUDE.md
 */
function detectNewDeps(content: string, stack: StackProfile): DriftItem[] {
  const items: DriftItem[] = [];

  // Significant dependencies that affect how code is written
  const significantDeps: Record<string, string> = {
    // JS/TS
    "next": "Next.js framework",
    "@remix-run/node": "Remix framework",
    "express": "Express server",
    "fastify": "Fastify server",
    "@prisma/client": "Prisma ORM",
    "drizzle-orm": "Drizzle ORM",
    "zod": "Zod validation",
    "@trpc/server": "tRPC",
    "@tanstack/react-query": "TanStack Query",
    "zustand": "Zustand state management",
    "@reduxjs/toolkit": "Redux Toolkit",
    "tailwindcss": "Tailwind CSS",
    "next-auth": "Auth.js (NextAuth)",
    "stripe": "Stripe payments",
    "vitest": "Vitest testing",
    "jest": "Jest testing",
    "@playwright/test": "Playwright E2E testing",
    "cypress": "Cypress E2E testing",
    "msw": "Mock Service Worker",
    // Rails
    "devise": "Devise authentication",
    "pundit": "Pundit authorization",
    "sidekiq": "Sidekiq background jobs",
    "turbo-rails": "Hotwire Turbo",
    "stimulus-rails": "Stimulus controllers",
    "view_component": "ViewComponent",
  };

  const contentLower = content.toLowerCase();

  for (const [dep, description] of Object.entries(significantDeps)) {
    if (dep in stack.keyDeps) {
      // Dep is installed — check if it's mentioned
      const depNameLower = dep.toLowerCase().replace(/[@/]/g, "");
      const shortName = description.split(" ")[0].toLowerCase();

      const mentioned =
        contentLower.includes(dep.toLowerCase()) ||
        contentLower.includes(depNameLower) ||
        contentLower.includes(shortName);

      if (!mentioned) {
        items.push({
          type: "new-dep",
          severity: "warning",
          message: `Dependency \`${dep}\` (${description}) is installed but not mentioned in CLAUDE.md.`,
          suggestion: `Add ${description} to the Critical Context or Key Patterns section.`,
        });
      }
    }
  }

  return items;
}

/**
 * Removed dependencies: Deps mentioned in CLAUDE.md but no longer installed
 */
function detectRemovedDeps(content: string, stack: StackProfile): DriftItem[] {
  const items: DriftItem[] = [];

  // Look for dependency-like references in the content
  const depPatterns = [
    // Matches things like "Prisma ORM", "Tailwind CSS", "Zustand"
    { pattern: /\bPrisma\b/i, dep: "@prisma/client", name: "Prisma" },
    { pattern: /\bDrizzle\b/i, dep: "drizzle-orm", name: "Drizzle" },
    { pattern: /\bTailwind\b/i, dep: "tailwindcss", name: "Tailwind CSS" },
    { pattern: /\bZustand\b/i, dep: "zustand", name: "Zustand" },
    { pattern: /\bRedux\b/i, dep: "@reduxjs/toolkit", name: "Redux" },
    { pattern: /\btRPC\b/, dep: "@trpc/server", name: "tRPC" },
    { pattern: /\bTanStack\s*Query\b/i, dep: "@tanstack/react-query", name: "TanStack Query" },
    { pattern: /\bPlaywright\b/i, dep: "@playwright/test", name: "Playwright" },
    { pattern: /\bCypress\b/i, dep: "cypress", name: "Cypress" },
    { pattern: /\bSidekiq\b/i, dep: "sidekiq", name: "Sidekiq" },
    { pattern: /\bDevise\b/i, dep: "devise", name: "Devise" },
    { pattern: /\bPundit\b/i, dep: "pundit", name: "Pundit" },
    { pattern: /\bStripe\b/i, dep: "stripe", name: "Stripe" },
    { pattern: /\bVitest\b/i, dep: "vitest", name: "Vitest" },
    { pattern: /\bJest\b/i, dep: "jest", name: "Jest" },
    { pattern: /\bExpress\b/i, dep: "express", name: "Express" },
    { pattern: /\bFastify\b/i, dep: "fastify", name: "Fastify" },
  ];

  for (const { pattern, dep, name } of depPatterns) {
    if (pattern.test(content) && !(dep in stack.keyDeps)) {
      items.push({
        type: "removed-dep",
        severity: "critical",
        message: `CLAUDE.md references ${name} but \`${dep}\` is not installed.`,
        suggestion: `Remove references to ${name} from CLAUDE.md, or install the dependency if it was removed by mistake.`,
      });
    }
  }

  return items;
}

/**
 * Framework changes: Framework version bump or new framework detected
 */
function detectFrameworkChanges(content: string, stack: StackProfile): DriftItem[] {
  const items: DriftItem[] = [];

  if (stack.framework === "unknown") return items;

  const frameworkName = capitalize(stack.framework);

  // Check if framework is mentioned at all
  const contentLower = content.toLowerCase();
  if (!contentLower.includes(stack.framework.toLowerCase())) {
    items.push({
      type: "framework-change",
      severity: "critical",
      message: `Current framework is ${frameworkName} but it is not mentioned in CLAUDE.md.`,
      suggestion: `Add ${frameworkName}${stack.frameworkVersion ? ` ${stack.frameworkVersion}` : ""} to the Critical Context section.`,
    });
    return items;
  }

  // Check if the version is mentioned and differs
  if (stack.frameworkVersion) {
    // Clean version string (remove ^ ~ etc)
    const cleanVersion = stack.frameworkVersion.replace(/^[\^~>=<]+/, "");
    const versionMajor = cleanVersion.split(".")[0];

    // Look for version references like "Next.js 14" or "Rails 7"
    const versionPatterns = [
      new RegExp(`${stack.framework}[\\s/]*(\\d+)`, "i"),
      new RegExp(`${frameworkName}[\\s/]*(\\d+)`, "i"),
    ];

    for (const vp of versionPatterns) {
      const vMatch = content.match(vp);
      if (vMatch && vMatch[1] !== versionMajor) {
        items.push({
          type: "framework-change",
          severity: "warning",
          message: `CLAUDE.md references ${frameworkName} ${vMatch[1]} but the installed version is ${cleanVersion}.`,
          suggestion: `Update the version reference from ${frameworkName} ${vMatch[1]} to ${frameworkName} ${cleanVersion}.`,
          autoFix: {
            section: "Critical Context",
            oldText: `${vMatch[0]}`,
            newText: `${vMatch[0].replace(vMatch[1], versionMajor)}`,
          },
        });
        break;
      }
    }
  }

  return items;
}

/**
 * Missing gotchas: New auto-generated dirs or known pitfalls not documented
 */
function detectMissingGotchas(
  content: string,
  sections: ParsedSection[],
  gotchas: GotchasProfile
): DriftItem[] {
  const items: DriftItem[] = [];

  // Check auto-generated directories
  for (const dir of gotchas.generatedDirs) {
    const dirName = dir.replace(/\/$/, "");
    if (!content.includes(dirName)) {
      items.push({
        type: "missing-gotcha",
        severity: "warning",
        message: `Auto-generated directory \`${dir}\` is not documented as a gotcha.`,
        suggestion: `Add "DON'T modify ${dir}" to the Gotchas section.`,
        autoFix: {
          section: "Gotchas",
          newText: `- DON'T modify ${dir} — auto-generated`,
        },
      });
    }
  }

  // Check auto-generated files
  for (const file of gotchas.generatedFiles) {
    if (!content.includes(file)) {
      items.push({
        type: "missing-gotcha",
        severity: "warning",
        message: `Auto-generated file \`${file}\` is not documented as a gotcha.`,
        suggestion: `Add "DON'T modify ${file} directly" to the Gotchas section.`,
        autoFix: {
          section: "Gotchas",
          newText: `- DON'T modify ${file} directly — auto-generated`,
        },
      });
    }
  }

  // Check critical gotchas from the analyzer
  for (const gotcha of gotchas.gotchas) {
    if (gotcha.severity !== "critical") continue;

    // Try to match the rule text roughly
    const ruleWords = gotcha.rule
      .replace(/DON'T\s+/i, "")
      .split(/\s+/)
      .slice(0, 3)
      .join(" ")
      .toLowerCase();

    if (!content.toLowerCase().includes(ruleWords)) {
      items.push({
        type: "missing-gotcha",
        severity: "info",
        message: `Critical gotcha not documented: "${gotcha.rule}"`,
        suggestion: `Add "${gotcha.rule} — ${gotcha.reason}" to the Gotchas section.`,
        autoFix: {
          section: "Gotchas",
          newText: `- ${gotcha.rule} — ${gotcha.reason}`,
        },
      });
    }
  }

  return items;
}

// ─── Scoring ────────────────────────────────────────────────

function calculateDriftScore(items: DriftItem[]): number {
  let score = 100;

  for (const item of items) {
    switch (item.severity) {
      case "critical":
        score -= 15;
        break;
      case "warning":
        score -= 7;
        break;
      case "info":
        score -= 2;
        break;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function estimateFixedScore(items: DriftItem[]): number {
  // Items with autoFix are fixable, so only non-fixable items remain
  const unfixable = items.filter((i) => !i.autoFix);
  return calculateDriftScore(unfixable);
}

// ─── Helpers ────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
