import type { LintPreset } from "../types.js";

export const strictPreset: LintPreset = {
  name: "strict",
  description: "Maximum rigor — all suggestions promoted to warnings",
  rules: [
    "token-budget",
    "token-bloat",
    "missing-verify",
    "stale-ref",
    "style-vs-linter",
    "vague",
    "redundant",
    "no-architecture",
    "missing-gotchas",
    "no-imports",
    "missing-patterns",
    "import-candidate",
    "context-efficiency",
    "duplicate-content",
  ],
  overrides: {
    "missing-gotchas": "warning",
    "no-imports": "warning",
    "missing-patterns": "warning",
    "import-candidate": "warning",
    "context-efficiency": "warning",
  },
};
