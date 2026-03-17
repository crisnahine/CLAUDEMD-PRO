import type { LintPreset } from "../types.js";

export const leanPreset: LintPreset = {
  name: "lean",
  description: "Minimal — only critical rules for small projects or early-stage repos",
  rules: [
    "token-budget",
    "missing-verify",
    "stale-ref",
    "vague",
    "no-architecture",
    "commands-runnable",
  ],
};
