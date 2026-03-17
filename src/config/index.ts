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

// ─── Config Validation ───────────────────────────────────────

export interface ConfigWarning {
  field: string;
  message: string;
}

const KNOWN_PRESETS = new Set(["default", "strict", "lean"]);
const VALID_SEVERITIES = new Set(["error", "warning", "suggestion", "off"]);
const KNOWN_CONFIG_KEYS = new Set([
  "preset", "maxTokens", "rules", "exclude", "framework",
  "output", "modular", "plugins",
]);

/**
 * Validate a loaded config and return warnings for any issues.
 * Does not throw — returns an array of problems to display.
 */
export function validateConfig(config: Record<string, unknown>): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  // Warn on unknown keys
  for (const key of Object.keys(config)) {
    if (!KNOWN_CONFIG_KEYS.has(key)) {
      warnings.push({ field: key, message: `Unknown config key "${key}"` });
    }
  }

  // Validate types
  if (config.maxTokens !== undefined && typeof config.maxTokens !== "number") {
    warnings.push({ field: "maxTokens", message: `"maxTokens" must be a number, got ${typeof config.maxTokens}` });
  }

  if (config.preset !== undefined && typeof config.preset === "string" && !KNOWN_PRESETS.has(config.preset)) {
    warnings.push({ field: "preset", message: `Unknown preset "${config.preset}". Valid presets: default, strict, lean` });
  }

  if (config.modular !== undefined && typeof config.modular !== "boolean") {
    warnings.push({ field: "modular", message: `"modular" must be a boolean, got ${typeof config.modular}` });
  }

  if (config.exclude !== undefined && !Array.isArray(config.exclude)) {
    warnings.push({ field: "exclude", message: `"exclude" must be an array, got ${typeof config.exclude}` });
  }

  if (config.plugins !== undefined && !Array.isArray(config.plugins)) {
    warnings.push({ field: "plugins", message: `"plugins" must be an array, got ${typeof config.plugins}` });
  }

  // Validate rule severities
  if (config.rules && typeof config.rules === "object") {
    for (const [ruleId, severity] of Object.entries(config.rules as Record<string, unknown>)) {
      if (typeof severity !== "string" || !VALID_SEVERITIES.has(severity)) {
        warnings.push({
          field: `rules.${ruleId}`,
          message: `Invalid severity "${severity}" for rule "${ruleId}". Valid: error, warning, suggestion, off`,
        });
      }
    }
  }

  return warnings;
}

export { type ClaudemdConfig } from "./schema.js";
export { DEFAULT_CONFIG } from "./schema.js";
