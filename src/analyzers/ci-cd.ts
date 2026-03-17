/**
 * CI/CD Analyzer - Detects CI pipelines, deployment targets, and Docker config
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CiCdProfile {
  provider: string | null; // "github-actions", "gitlab-ci", "circleci", "jenkins", "travis-ci", "azure-pipelines", "bitbucket-pipelines"
  workflowFiles: string[];
  hasDeployStep: boolean;
  // New fields
  deployTarget: string | null; // vercel, netlify, fly, heroku, railway, render, docker, etc.
  hasDocker: boolean;
  hasDockerCompose: boolean;
  triggers: string[]; // push, pull_request, schedule, etc.
  jobs: string[]; // extracted job names
}

export async function analyzeCiCd(rootDir: string): Promise<CiCdProfile> {
  const profile: CiCdProfile = {
    provider: null,
    workflowFiles: [],
    hasDeployStep: false,
    deployTarget: null,
    hasDocker: false,
    hasDockerCompose: false,
    triggers: [],
    jobs: [],
  };

  // ─── CI Providers ───────────────────────────────────────────

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

      // Parse each workflow file for triggers, jobs, secrets
      for (const relPath of profile.workflowFiles) {
        const content = readSafe(join(rootDir, relPath));
        if (content) {
          parseGitHubActionsWorkflow(content, profile);
        }
      }
    } catch { /* permission denied */ }
  }

  // GitLab CI
  if (existsSync(join(rootDir, ".gitlab-ci.yml"))) {
    profile.provider = profile.provider ?? "gitlab-ci";
    if (!profile.workflowFiles.includes(".gitlab-ci.yml")) {
      profile.workflowFiles.push(".gitlab-ci.yml");
    }
  }

  // CircleCI
  if (existsSync(join(rootDir, ".circleci/config.yml"))) {
    profile.provider = profile.provider ?? "circleci";
    if (!profile.workflowFiles.includes(".circleci/config.yml")) {
      profile.workflowFiles.push(".circleci/config.yml");
    }
  }

  // Jenkins
  if (existsSync(join(rootDir, "Jenkinsfile"))) {
    profile.provider = profile.provider ?? "jenkins";
    if (!profile.workflowFiles.includes("Jenkinsfile")) {
      profile.workflowFiles.push("Jenkinsfile");
    }
  }

  // Travis CI
  if (existsSync(join(rootDir, ".travis.yml"))) {
    profile.provider = profile.provider ?? "travis-ci";
    if (!profile.workflowFiles.includes(".travis.yml")) {
      profile.workflowFiles.push(".travis.yml");
    }
  }

  // Azure Pipelines
  if (existsSync(join(rootDir, "azure-pipelines.yml"))) {
    profile.provider = profile.provider ?? "azure-pipelines";
    if (!profile.workflowFiles.includes("azure-pipelines.yml")) {
      profile.workflowFiles.push("azure-pipelines.yml");
    }
  }

  // Bitbucket Pipelines
  if (existsSync(join(rootDir, "bitbucket-pipelines.yml"))) {
    profile.provider = profile.provider ?? "bitbucket-pipelines";
    if (!profile.workflowFiles.includes("bitbucket-pipelines.yml")) {
      profile.workflowFiles.push("bitbucket-pipelines.yml");
    }
  }

  // ─── Deploy Targets ─────────────────────────────────────────

  // Vercel
  if (existsSync(join(rootDir, "vercel.json"))) {
    profile.deployTarget = "vercel";
    profile.hasDeployStep = true;
  }

  // Netlify
  if (existsSync(join(rootDir, "netlify.toml"))) {
    profile.deployTarget = profile.deployTarget ?? "netlify";
    profile.hasDeployStep = true;
  }

  // Railway
  if (
    existsSync(join(rootDir, "railway.json")) ||
    existsSync(join(rootDir, "railway.toml"))
  ) {
    profile.deployTarget = profile.deployTarget ?? "railway";
    profile.hasDeployStep = true;
  }

  // Fly.io
  if (existsSync(join(rootDir, "fly.toml"))) {
    profile.deployTarget = profile.deployTarget ?? "fly";
    profile.hasDeployStep = true;
  }

  // Render
  if (existsSync(join(rootDir, "render.yaml"))) {
    profile.deployTarget = profile.deployTarget ?? "render";
    profile.hasDeployStep = true;
  }

  // Heroku
  if (
    existsSync(join(rootDir, "Procfile")) ||
    existsSync(join(rootDir, "app.json"))
  ) {
    profile.deployTarget = profile.deployTarget ?? "heroku";
    profile.hasDeployStep = true;
  }

  // ─── Docker ─────────────────────────────────────────────────

  profile.hasDocker =
    existsSync(join(rootDir, "Dockerfile")) ||
    existsSync(join(rootDir, "docker/Dockerfile"));

  profile.hasDockerCompose =
    existsSync(join(rootDir, "docker-compose.yml")) ||
    existsSync(join(rootDir, "docker-compose.yaml")) ||
    existsSync(join(rootDir, "compose.yml"));

  // If Docker is present but no other deploy target, set docker as deploy target
  if (profile.hasDocker && !profile.deployTarget) {
    profile.deployTarget = "docker";
  }

  // Detect deploy step from workflow file names or content if not already detected
  if (!profile.hasDeployStep) {
    profile.hasDeployStep = profile.workflowFiles.some((f) =>
      f.toLowerCase().includes("deploy")
    );
  }

  // Deduplicate triggers and jobs
  profile.triggers = [...new Set(profile.triggers)];
  profile.jobs = [...new Set(profile.jobs)];

  return profile;
}

/**
 * Parse a GitHub Actions workflow YAML to extract triggers, job names, and secrets usage.
 * Uses simple line-by-line parsing — no YAML library needed.
 */
function parseGitHubActionsWorkflow(content: string, profile: CiCdProfile): void {
  const lines = content.split("\n");

  let inOnBlock = false;
  let inJobsBlock = false;
  let onBlockIndent = -1;
  let jobsBlockIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Detect `on:` block (trigger events)
    if (/^on\s*:/.test(trimmed) && indent === 0) {
      inOnBlock = true;
      inJobsBlock = false;
      onBlockIndent = indent;

      // Handle inline `on: push` or `on: [push, pull_request]`
      const inlineMatch = trimmed.match(/^on\s*:\s*(.+)/);
      if (inlineMatch) {
        const value = inlineMatch[1].trim();
        if (value.startsWith("[")) {
          // on: [push, pull_request]
          const events = value.replace(/[\[\]]/g, "").split(",").map((e) => e.trim()).filter(Boolean);
          profile.triggers.push(...events);
          inOnBlock = false;
        } else if (!value.startsWith("{") && value.length > 0) {
          // on: push
          profile.triggers.push(value);
          inOnBlock = false;
        }
      }
      continue;
    }

    // Detect `jobs:` block
    if (/^jobs\s*:/.test(trimmed) && indent === 0) {
      inJobsBlock = true;
      inOnBlock = false;
      jobsBlockIndent = indent;
      continue;
    }

    // New top-level key ends current block
    if (indent === 0 && trimmed.includes(":")) {
      inOnBlock = false;
      inJobsBlock = false;
      continue;
    }

    // Parse trigger events inside `on:` block
    if (inOnBlock && indent > onBlockIndent) {
      const eventMatch = trimmed.match(/^(\w[\w-]*)\s*:/);
      if (eventMatch && indent === onBlockIndent + 2) {
        profile.triggers.push(eventMatch[1]);
      }
    }

    // Parse job names inside `jobs:` block (direct children only)
    if (inJobsBlock && indent > jobsBlockIndent) {
      const jobMatch = trimmed.match(/^(\w[\w-]*)\s*:/);
      if (jobMatch && indent === jobsBlockIndent + 2) {
        profile.jobs.push(jobMatch[1]);
      }
    }

    // Detect secrets usage anywhere in the file
    if (/secrets\./.test(trimmed)) {
      // Check for deploy-related keywords if secrets are used
      if (/deploy|release|publish/i.test(trimmed)) {
        profile.hasDeployStep = true;
      }
    }

    // Detect deploy steps from step names or action usage
    if (/deploy|aws-actions|google-github-actions.*deploy|azure\/webapps-deploy/i.test(trimmed)) {
      profile.hasDeployStep = true;
    }
  }
}

function readSafe(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : null;
  } catch {
    return null;
  }
}
