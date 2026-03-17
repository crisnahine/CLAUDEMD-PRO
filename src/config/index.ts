/**
 * Configuration Loader
 *
 * Uses cosmiconfig to load .claudemdrc, claudemd.config.js, etc.
 */

import { cosmiconfigSync } from "cosmiconfig";
import { DEFAULT_CONFIG, type ClaudemdConfig } from "./schema.js";

const MODULE_NAME = "claudemd";

/**
 * Load configuration from the nearest config file.
 * Searches for: .claudemdrc, .claudemdrc.json, .claudemdrc.yaml,
 * claudemd.config.js, claudemd.config.ts, package.json "claudemd" key
 */
export function loadConfig(rootDir: string): ClaudemdConfig {
  try {
    const explorer = cosmiconfigSync(MODULE_NAME, {
      searchPlaces: [
        `.${MODULE_NAME}rc`,
        `.${MODULE_NAME}rc.json`,
        `.${MODULE_NAME}rc.yaml`,
        `.${MODULE_NAME}rc.yml`,
        `${MODULE_NAME}.config.js`,
        `${MODULE_NAME}.config.ts`,
        `package.json`,
      ],
    });

    const result = explorer.search(rootDir);
    if (result?.config) {
      return mergeConfig(DEFAULT_CONFIG, result.config);
    }
  } catch {
    // Config loading failed — use defaults
  }

  return { ...DEFAULT_CONFIG };
}

function mergeConfig(
  defaults: ClaudemdConfig,
  overrides: Partial<ClaudemdConfig>
): ClaudemdConfig {
  return {
    ...defaults,
    ...overrides,
    rules: { ...defaults.rules, ...overrides.rules },
    exclude: [...(defaults.exclude ?? []), ...(overrides.exclude ?? [])],
    plugins: [...(defaults.plugins ?? []), ...(overrides.plugins ?? [])],
  };
}

export { type ClaudemdConfig } from "./schema.js";
export { DEFAULT_CONFIG } from "./schema.js";
