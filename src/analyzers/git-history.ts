/**
 * Git History Analyzer
 *
 * Mines git log for patterns that inform gotchas:
 * - Frequently reverted files (indicates fragile code)
 * - High-churn directories (hotspots)
 * - Common merge conflict zones
 * - Files that are often changed together (coupling)
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface GitInsight {
  type: "high-churn" | "revert-prone" | "conflict-zone" | "coupled-files";
  message: string;
  files: string[];
  severity: "important" | "nice-to-have";
}

export interface GitHistoryProfile {
  isGitRepo: boolean;
  insights: GitInsight[];
  topChangedFiles: Array<{ file: string; changes: number }>;
  recentContributors: number;
}

function runGit(rootDir: string, args: string): string | null {
  try {
    return execSync(`git ${args}`, {
      cwd: rootDir,
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export async function analyzeGitHistory(rootDir: string): Promise<GitHistoryProfile> {
  const profile: GitHistoryProfile = {
    isGitRepo: existsSync(join(rootDir, ".git")),
    insights: [],
    topChangedFiles: [],
    recentContributors: 0,
  };

  if (!profile.isGitRepo) return profile;

  // ── Top changed files (last 6 months) ──
  const logOutput = runGit(rootDir, 'log --since="6 months ago" --name-only --pretty=format: --diff-filter=M');
  if (logOutput) {
    const fileCounts = new Map<string, number>();
    for (const line of logOutput.split("\n")) {
      const file = line.trim();
      if (!file || file.includes("node_modules") || file.includes(".lock")) continue;
      fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
    }

    profile.topChangedFiles = [...fileCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([file, changes]) => ({ file, changes }));

    // High-churn directories
    const dirCounts = new Map<string, number>();
    for (const [file, count] of fileCounts) {
      const dir = file.split("/").slice(0, 2).join("/");
      if (dir) dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + count);
    }

    const sortedDirs = [...dirCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topDir = sortedDirs[0];
    if (topDir && topDir[1] > 50) {
      profile.insights.push({
        type: "high-churn",
        message: `${topDir[0]}/ has ${topDir[1]} changes in 6 months — extra care needed here`,
        files: [topDir[0]],
        severity: "important",
      });
    }
  }

  // ── Revert-prone files ──
  const revertLog = runGit(rootDir, 'log --since="6 months ago" --grep="revert" --name-only --pretty=format: -i');
  if (revertLog) {
    const revertFiles = new Map<string, number>();
    for (const line of revertLog.split("\n")) {
      const file = line.trim();
      if (!file) continue;
      revertFiles.set(file, (revertFiles.get(file) ?? 0) + 1);
    }

    const frequentReverts = [...revertFiles.entries()].filter(([_, count]) => count >= 2);
    if (frequentReverts.length > 0) {
      profile.insights.push({
        type: "revert-prone",
        message: `Files frequently reverted: ${frequentReverts.map(([f]) => f).join(", ")}. Be extra careful with changes.`,
        files: frequentReverts.map(([f]) => f),
        severity: "important",
      });
    }
  }

  // ── Merge conflict zones ──
  const mergeLog = runGit(rootDir, 'log --since="6 months ago" --merges --name-only --pretty=format:');
  if (mergeLog) {
    const mergeFiles = new Map<string, number>();
    for (const line of mergeLog.split("\n")) {
      const file = line.trim();
      if (!file) continue;
      mergeFiles.set(file, (mergeFiles.get(file) ?? 0) + 1);
    }

    const conflictProne = [...mergeFiles.entries()]
      .filter(([_, count]) => count >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (conflictProne.length > 0) {
      profile.insights.push({
        type: "conflict-zone",
        message: `Frequent merge conflict zones: ${conflictProne.map(([f]) => f).join(", ")}`,
        files: conflictProne.map(([f]) => f),
        severity: "nice-to-have",
      });
    }
  }

  // ── Recent contributors ──
  const contributorOutput = runGit(rootDir, 'shortlog -sn --since="3 months ago" HEAD');
  if (contributorOutput) {
    profile.recentContributors = contributorOutput.split("\n").filter((l) => l.trim()).length;
  }

  return profile;
}
