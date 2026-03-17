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
  analyzedAt: string;
}

export interface AnalyzerOptions {
  rootDir: string;
  framework?: string; // Override auto-detection
  verbose?: boolean;
  /** Skip git history analysis (faster) */
  skipGit?: boolean;
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
  const { rootDir, framework, skipGit } = opts;

  // Phase 1: Stack detection (everything else depends on this)
  const stack = await detectStack(rootDir, framework);

  // Phase 2: Run remaining analyzers in parallel
  const [architecture, commands, database, testing, gotchas, environment, cicd, gitHistory] =
    await Promise.all([
      safeAnalyze("architecture", () => analyzeArchitecture(rootDir, stack)),
      safeAnalyze("commands", () => analyzeCommands(rootDir, stack)),
      safeAnalyze("database", () => analyzeDatabase(rootDir, stack)),
      safeAnalyze("testing", () => analyzeTesting(rootDir, stack)),
      safeAnalyze("gotchas", () => analyzeGotchas(rootDir, stack)),
      safeAnalyze("environment", () => analyzeEnvironment(rootDir)),
      safeAnalyze("cicd", () => analyzeCiCd(rootDir)),
      skipGit
        ? Promise.resolve({ isGitRepo: false, insights: [], topChangedFiles: [], recentContributors: 0 } as GitHistoryProfile)
        : safeAnalyze("gitHistory", () => analyzeGitHistory(rootDir)),
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
