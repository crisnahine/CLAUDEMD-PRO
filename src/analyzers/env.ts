/**
 * Environment Analyzer - Detects env vars, secret management, and env file structure
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface EnvVar {
  name: string;
  hasDefault: boolean;
  source: string; // ".env.example", "docker-compose.yml", etc.
}

export interface EnvironmentProfile {
  envVars: EnvVar[];
  hasDocker: boolean;
  hasDockerCompose: boolean;
  // New fields
  envFiles: string[]; // all .env* files found
  secretManager: string | null; // aws-ssm, vault, 1password, doppler, etc.
  hasTypedEnv: boolean; // .env.d.ts or env.d.ts exists
  varGroups: Record<string, number>; // prefix -> count (e.g., DATABASE -> 3)
}

/** Files that are safe to parse for variable names (templates/examples only) */
const SAFE_ENV_FILES = [
  ".env.example",
  ".env.local.example",
  ".env.development.example",
  ".env.production.example",
  ".env.test.example",
];

/** Additional env files to detect (not read values from, only names) */
const ENV_FILE_PATTERNS = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".env.staging",
  ".env.example",
  ".env.local.example",
  ".env.development.example",
  ".env.production.example",
  ".env.test.example",
  ".env.sample",
  ".env.template",
];

/** Known prefixes for env variable grouping */
const GROUP_PREFIXES = [
  "DATABASE",
  "DB",
  "AWS",
  "NEXT_PUBLIC",
  "VITE",
  "REACT_APP",
  "NUXT",
  "REDIS",
  "SMTP",
  "MAIL",
  "S3",
  "STRIPE",
  "SENTRY",
  "AUTH",
  "OAUTH",
  "JWT",
  "API",
  "APP",
  "LOG",
  "CACHE",
];

export async function analyzeEnvironment(rootDir: string): Promise<EnvironmentProfile> {
  const envVars: EnvVar[] = [];
  const seenVarNames = new Set<string>();

  // ─── Detect all .env* files present ─────────────────────────
  const envFiles: string[] = [];
  for (const pattern of ENV_FILE_PATTERNS) {
    if (existsSync(join(rootDir, pattern))) {
      envFiles.push(pattern);
    }
  }

  // Also scan root directory for any other .env* files we may have missed
  try {
    const rootEntries = readdirSync(rootDir);
    for (const entry of rootEntries) {
      if (entry.startsWith(".env") && !envFiles.includes(entry)) {
        envFiles.push(entry);
      }
    }
  } catch { /* permission denied */ }

  // ─── Parse safe env files for variable names ────────────────
  // Only read .env.example and *.example files for actual values
  for (const safeFile of SAFE_ENV_FILES) {
    const content = readSafe(join(rootDir, safeFile));
    if (content) {
      parseEnvFileVars(content, safeFile, envVars, seenVarNames);
    }
  }

  // For non-example env files, only extract variable NAMES (not values)
  // This is safe because we never read actual secret values
  const nameOnlyFiles = [".env.local", ".env.development", ".env.production", ".env.test"];
  for (const envFile of nameOnlyFiles) {
    const content = readSafe(join(rootDir, envFile));
    if (content) {
      parseEnvFileNamesOnly(content, envFile, envVars, seenVarNames);
    }
  }

  // ─── Docker detection ───────────────────────────────────────
  const hasDocker =
    existsSync(join(rootDir, "Dockerfile")) ||
    existsSync(join(rootDir, "docker/Dockerfile"));

  const hasDockerCompose =
    existsSync(join(rootDir, "docker-compose.yml")) ||
    existsSync(join(rootDir, "docker-compose.yaml")) ||
    existsSync(join(rootDir, "compose.yml"));

  // ─── Secret manager detection ───────────────────────────────
  const secretManager = detectSecretManager(rootDir);

  // ─── Typed env detection ────────────────────────────────────
  const hasTypedEnv =
    existsSync(join(rootDir, ".env.d.ts")) ||
    existsSync(join(rootDir, "env.d.ts")) ||
    existsSync(join(rootDir, "src/env.d.ts")) ||
    existsSync(join(rootDir, "src/env.ts")) ||
    existsSync(join(rootDir, "src/types/env.d.ts"));

  // ─── Variable grouping by prefix ───────────────────────────
  const varGroups = computeVarGroups(envVars);

  return {
    envVars,
    hasDocker,
    hasDockerCompose,
    envFiles,
    secretManager,
    hasTypedEnv,
    varGroups,
  };
}

/**
 * Parse an env file and extract variable names with default info.
 */
function parseEnvFileVars(
  content: string,
  source: string,
  envVars: EnvVar[],
  seen: Set<string>
): void {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key) {
      const name = key.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        envVars.push({
          name,
          hasDefault: rest.join("=").trim().length > 0,
          source,
        });
      }
    }
  }
}

/**
 * Parse an env file but only extract variable names (hasDefault always false).
 * Used for non-example files where we don't want to inspect values.
 */
function parseEnvFileNamesOnly(
  content: string,
  source: string,
  envVars: EnvVar[],
  seen: Set<string>
): void {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const name = trimmed.slice(0, eqIndex).trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        envVars.push({
          name,
          hasDefault: false,
          source,
        });
      }
    }
  }
}

/**
 * Detect secret management tools.
 */
function detectSecretManager(rootDir: string): string | null {
  // Doppler
  if (existsSync(join(rootDir, ".doppler.yaml")) || existsSync(join(rootDir, "doppler.yaml"))) {
    return "doppler";
  }

  // 1Password (.op/ directory or op:// references in config files)
  if (existsSync(join(rootDir, ".op"))) {
    return "1password";
  }

  // AWS SSM / Secrets Manager (.aws/ directory presence)
  if (existsSync(join(rootDir, ".aws"))) {
    return "aws-ssm";
  }

  // Check CI/CD files for vault or op:// references
  const ciFiles = [
    ".github/workflows",
    ".gitlab-ci.yml",
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
  ];

  for (const ciFile of ciFiles) {
    const fullPath = join(rootDir, ciFile);
    if (existsSync(fullPath)) {
      // For directories (like .github/workflows), scan yaml files inside
      try {
        const stat = readSafe(fullPath);
        if (stat === null && existsSync(fullPath)) {
          // It's a directory — scan files inside
          const entries = readdirSync(fullPath).filter(
            (f) => f.endsWith(".yml") || f.endsWith(".yaml")
          );
          for (const entry of entries) {
            const content = readSafe(join(fullPath, entry));
            if (content) {
              const manager = detectSecretManagerInContent(content);
              if (manager) return manager;
            }
          }
        } else if (stat) {
          const manager = detectSecretManagerInContent(stat);
          if (manager) return manager;
        }
      } catch { /* permission denied */ }
    }
  }

  return null;
}

/**
 * Check file content for secret manager references.
 */
function detectSecretManagerInContent(content: string): string | null {
  if (/op:\/\//.test(content)) return "1password";
  if (/hashicorp.*vault|vault\s+kv|VAULT_ADDR|VAULT_TOKEN/i.test(content)) return "vault";
  if (/aws.*secretsmanager|ssm.*parameter|AWS_SSM/i.test(content)) return "aws-ssm";
  if (/doppler/i.test(content)) return "doppler";
  return null;
}

/**
 * Group env variables by common prefixes and return counts.
 * Only includes groups with 2+ variables.
 */
function computeVarGroups(envVars: EnvVar[]): Record<string, number> {
  const groups: Record<string, number> = {};

  for (const envVar of envVars) {
    for (const prefix of GROUP_PREFIXES) {
      if (envVar.name.startsWith(prefix + "_") || envVar.name === prefix) {
        groups[prefix] = (groups[prefix] ?? 0) + 1;
        break; // Only count each var in its first matching group
      }
    }
  }

  // Filter to only groups with 2+ variables
  const filtered: Record<string, number> = {};
  for (const [key, count] of Object.entries(groups)) {
    if (count >= 2) {
      filtered[key] = count;
    }
  }

  return filtered;
}

function readSafe(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : null;
  } catch {
    return null;
  }
}
