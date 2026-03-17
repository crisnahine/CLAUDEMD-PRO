/**
 * CI/CD Analyzer - Detects CI pipelines and deployment config
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface CiCdProfile {
  provider: string | null; // "github-actions", "gitlab-ci", "circleci"
  workflowFiles: string[];
  hasDeployStep: boolean;
}

export async function analyzeCiCd(rootDir: string): Promise<CiCdProfile> {
  const profile: CiCdProfile = {
    provider: null,
    workflowFiles: [],
    hasDeployStep: false,
  };

  // GitHub Actions
  const ghDir = join(rootDir, ".github/workflows");
  if (existsSync(ghDir)) {
    profile.provider = "github-actions";
    try {
      profile.workflowFiles = readdirSync(ghDir)
        .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
        .map((f) => `.github/workflows/${f}`);
      profile.hasDeployStep = profile.workflowFiles.some((f) =>
        f.toLowerCase().includes("deploy")
      );
    } catch { /* permission denied */ }
  }

  // GitLab CI
  if (existsSync(join(rootDir, ".gitlab-ci.yml"))) {
    profile.provider = "gitlab-ci";
    profile.workflowFiles = [".gitlab-ci.yml"];
  }

  // CircleCI
  if (existsSync(join(rootDir, ".circleci/config.yml"))) {
    profile.provider = "circleci";
    profile.workflowFiles = [".circleci/config.yml"];
  }

  return profile;
}
