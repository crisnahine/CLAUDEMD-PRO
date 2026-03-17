/**
 * Environment Analyzer - Detects env vars from .env.example and docker-compose
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface EnvVar {
  name: string;
  hasDefault: boolean;
  source: string; // ".env.example", "docker-compose.yml"
}

export interface EnvironmentProfile {
  envVars: EnvVar[];
  hasDocker: boolean;
  hasDockerCompose: boolean;
}

export async function analyzeEnvironment(rootDir: string): Promise<EnvironmentProfile> {
  const envVars: EnvVar[] = [];

  // Parse .env.example
  const envExample = readSafe(join(rootDir, ".env.example"));
  if (envExample) {
    for (const line of envExample.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key) {
        envVars.push({
          name: key.trim(),
          hasDefault: rest.join("=").trim().length > 0,
          source: ".env.example",
        });
      }
    }
  }

  return {
    envVars,
    hasDocker:
      existsSync(join(rootDir, "Dockerfile")) ||
      existsSync(join(rootDir, "docker/Dockerfile")),
    hasDockerCompose:
      existsSync(join(rootDir, "docker-compose.yml")) ||
      existsSync(join(rootDir, "docker-compose.yaml")) ||
      existsSync(join(rootDir, "compose.yml")),
  };
}

function readSafe(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : null;
  } catch {
    return null;
  }
}
