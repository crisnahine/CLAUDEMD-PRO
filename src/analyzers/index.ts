/**
 * Analyzer Orchestrator
 *
 * Runs all analysis modules against the codebase and produces a unified
 * CodebaseProfile that the generator uses to build CLAUDE.md.
 */

import { detectStack, type StackProfile } from "./stack-detector.js";
import { analyzeArchitecture, type ArchitectureProfile } from "./architecture.js";
import { analyzeCommands, type CommandsProfile } from "./commands.js";
import { analyzeDatabase, type DatabaseProfile } from "./database.js";
import { analyzeTesting, type TestingProfile } from "./testing.js";
import { analyzeGotchas, type GotchasProfile } from "./gotchas.js";
import { analyzeEnvironment, type EnvironmentProfile } from "./env.js";
import { analyzeCiCd, type CiCdProfile } from "./ci-cd.js";
import { analyzeGitHistory, type GitHistoryProfile } from "./git-history.js";
import { scanFiles, type FileScanResult } from "./file-scanner.js";
import { analyzeDomains, type DomainProfile } from "./domain-analyzer.js";
import { analyzeStyle, type StyleProfile } from "./style-analyzer.js";

// ─── Unified codebase profile ───────────────────────────────
export interface CodebaseProfile {
  rootDir: string;
  stack: StackProfile;
  architecture: ArchitectureProfile;
  commands: CommandsProfile;
  database: DatabaseProfile;
  testing: TestingProfile;
  gotchas: GotchasProfile;
  environment: EnvironmentProfile;
  cicd: CiCdProfile;
  gitHistory: GitHistoryProfile;
  fileScan: FileScanResult;
  domains: DomainProfile;
  style: StyleProfile;
  analyzedAt: string;
}

export interface AnalyzerOptions {
  rootDir: string;
  framework?: string; // Override auto-detection
  verbose?: boolean;
  /** Skip git history analysis (faster) */
  skipGit?: boolean;
  /** Directories to exclude from analysis (from config) */
  exclude?: string[];
}

/**
 * Run all analyzers against the codebase.
 * Each analyzer is independent and non-blocking — a failure in one
 * doesn't stop the others. We collect partial results and let the
 * generator handle missing data gracefully.
 */
export async function analyzeCodebase(
  opts: AnalyzerOptions
): Promise<CodebaseProfile> {
  const { rootDir, framework, skipGit, exclude = [] } = opts;

  // Phase 1: Stack detection (everything else depends on this)
  const stack = await detectStack(rootDir, framework);

  // Phase 2: File categorization + existing analyzers in parallel
  let [architecture, commands, database, testing, gotchas, environment, cicd, gitHistory, fileScan] =
    await Promise.all([
      safeAnalyze("architecture", () => analyzeArchitecture(rootDir, stack, exclude)),
      safeAnalyze("commands", () => analyzeCommands(rootDir, stack)),
      safeAnalyze("database", () => analyzeDatabase(rootDir, stack)),
      safeAnalyze("testing", () => analyzeTesting(rootDir, stack)),
      safeAnalyze("gotchas", () => analyzeGotchas(rootDir, stack)),
      safeAnalyze("environment", () => analyzeEnvironment(rootDir)),
      safeAnalyze("cicd", () => analyzeCiCd(rootDir)),
      skipGit
        ? Promise.resolve({ isGitRepo: false, insights: [], topChangedFiles: [], recentContributors: 0 } as GitHistoryProfile)
        : safeAnalyze("gitHistory", () => analyzeGitHistory(rootDir)),
      safeAnalyze("fileScan", () => Promise.resolve(scanFiles(rootDir, exclude, stack.framework))),
    ]);

  // Phase 2.5: Framework-specific deep enrichment
  const enrichment = await safeAnalyze("framework-enrichment", async () => {
    const { enrichWithFramework } = await import("./framework-enrichment.js");
    return enrichWithFramework(rootDir, stack.framework, stack.keyDeps);
  });

  // Merge enrichment into existing profiles
  if (enrichment) {
    // Merge gotchas (append framework-specific ones, avoid duplicates)
    if (enrichment.gotchas?.length) {
      const existingRules = new Set(gotchas.gotchas?.map(g => g.rule) ?? []);
      for (const g of enrichment.gotchas) {
        if (!existingRules.has(g.rule)) {
          gotchas.gotchas = gotchas.gotchas ?? [];
          gotchas.gotchas.push(g);
        }
      }
    }
    // Merge commands (append, avoid duplicate commands)
    if (enrichment.commands?.length) {
      const existingCmds = new Set(commands.commands?.map(c => c.command) ?? []);
      for (const c of enrichment.commands) {
        if (!existingCmds.has(c.command)) {
          commands.commands = commands.commands ?? [];
          commands.commands.push(c);
        }
      }
    }
    // Merge patterns (append to architecture patterns)
    if (enrichment.patterns?.length) {
      const existingPatterns = new Set(architecture.patterns ?? []);
      for (const p of enrichment.patterns) {
        if (!existingPatterns.has(p.label)) {
          architecture.patterns = architecture.patterns ?? [];
          architecture.patterns.push(p.label);
        }
      }
    }
    // Merge entry points
    if (enrichment.entryPoints?.length) {
      const existingEntries = new Set(architecture.entryPoints ?? []);
      for (const e of enrichment.entryPoints) {
        if (!existingEntries.has(e)) {
          architecture.entryPoints = architecture.entryPoints ?? [];
          architecture.entryPoints.push(e);
        }
      }
    }
  }

  // Phase 3: Domain deep dive + style extraction (depend on fileScan)
  const [domains, style] = await Promise.all([
    safeAnalyze("domains", () => analyzeDomains(rootDir, stack, fileScan)),
    safeAnalyze("style", () => analyzeStyle(rootDir, stack, fileScan)),
  ]);

  return {
    rootDir,
    stack,
    architecture,
    commands,
    database,
    testing,
    gotchas,
    environment,
    cicd,
    gitHistory,
    fileScan,
    domains,
    style,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Wraps an analyzer call so it returns a partial/empty result on failure
 * instead of crashing the entire pipeline.
 */
async function safeAnalyze<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(
      `[warn] Analyzer "${name}" failed: ${err instanceof Error ? err.message : err}`
    );
    // Return empty object — generator handles missing fields
    return {} as T;
  }
}
