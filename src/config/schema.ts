/**
 * Configuration Schema
 *
 * Defines the structure for .claudemdrc configuration files.
 */

import type { Severity } from "../linter/types.js";

export interface ClaudemdConfig {
  /** Lint preset name: "default" | "strict" | "lean" */
  preset?: string;

  /** Max token budget for root CLAUDE.md */
  maxTokens?: number;

  /** Override rule severities */
  rules?: Record<string, Severity | "off">;

  /** Directories to exclude from analysis */
  exclude?: string[];

  /** Framework override (skip auto-detection) */
  framework?: string;

  /** Output path for generated CLAUDE.md */
  output?: string;

  /** Enable @import structure generation */
  modular?: boolean;

  /** Community plugin rule packages */
  plugins?: string[];
}

export const DEFAULT_CONFIG: ClaudemdConfig = {
  preset: "default",
  maxTokens: 3000,
  rules: {},
  exclude: [],
  modular: false,
  plugins: [],
};
