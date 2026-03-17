/**
 * Lint Rule Types
 *
 * Shared type definitions for the modular lint rule system.
 */

export type Severity = "error" | "warning" | "suggestion";

export interface LintResult {
  ruleId: string;
  severity: Severity;
  message: string;
  line?: number;
  fix?: string;
}

export interface LintContext {
  content: string;
  lines: string[];
  rootDir: string;
  sections: Section[];
  estimatedTokens: number;
  /** Stack profile if available (lazy-loaded) */
  stackLanguage?: string;
  stackFramework?: string;
}

export interface Section {
  heading: string;
  content: string;
  line: number;
}

export interface LintRule {
  id: string;
  severity: Severity;
  description: string;
  run(ctx: LintContext): LintResult[];
}

export interface ScoreBreakdown {
  tokenEfficiency: number;
  actionability: number;
  coverage: number;
  specificity: number;
  freshness: number;
  antiPatternFree: number;
}

export interface LintPreset {
  name: string;
  description: string;
  rules: string[];
  /** Override severity for specific rules */
  overrides?: Record<string, Severity>;
}
