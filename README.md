# claudemd-pro

[![npm version](https://img.shields.io/npm/v/claudemd-pro)](https://www.npmjs.com/package/claudemd-pro)
[![GitHub](https://img.shields.io/github/license/crisnahine/CLAUDEMD-PRO)](https://github.com/crisnahine/CLAUDEMD-PRO)

> Deep codebase-aware CLAUDE.md generator, linter, and effectiveness scorer.

Your CLAUDE.md is the highest-leverage file in your AI coding workflow. A good one makes Claude perform like a senior teammate. A bad one wastes tokens and actively hurts performance.

**claudemd-pro** goes beyond `/init` and basic schema linting. It deeply analyzes your codebase — architecture, patterns, dependencies, CI config, known pitfalls — and produces an effective CLAUDE.md that actually helps.

## Features

- **Generate** — Analyze your codebase and produce a battle-tested CLAUDE.md
- **Lint** — Score your existing CLAUDE.md on *effectiveness*, not just structure
- **Budget** — See exactly where your tokens are going and how to optimize
- **Evolve** — Detect codebase drift and keep your CLAUDE.md in sync automatically
- **Compare** — Before/after scoring to measure your CLAUDE.md improvements
- **MCP Server** — Integrate directly with Claude Desktop and Claude Code (10 tools including deep file scanning)
- **GitHub Action** — Lint your CLAUDE.md on every push/PR with annotations
- **Framework-Aware** — Deep analysis for Rails, Next.js, Django, Laravel, Phoenix, Go, Rust, Spring, FastAPI, NestJS, Nuxt, Svelte/SvelteKit, Astro, Remix, Hono, Express.js
- **Git History Mining** — Extract patterns and conventions from your commit history
- **CI-Ready** — JSON output, strict mode, exit codes for pipeline integration

## Installation

```bash
# Run directly with npx (no install needed)
npx claudemd-pro generate

# Or install globally for the `claudemd` command
npm install -g claudemd-pro
```

## Quick Start

```bash
# Generate a CLAUDE.md for your project
claudemd generate

# Lint an existing CLAUDE.md
claudemd lint

# Quick effectiveness score
claudemd score

# Token budget breakdown
claudemd budget --optimize

# Detect drift since last generation
claudemd evolve

# Compare before/after
claudemd compare old-CLAUDE.md new-CLAUDE.md
```

> If you didn't install globally, prefix commands with `npx claudemd-pro` instead of `claudemd`.

## Why Not Just Use `/init`?

| Feature | `/init` | cclint | claudemd-pro |
|---------|---------|--------|--------------|
| Reads project files | ✅ Basic | ❌ | ✅ Deep |
| Framework-specific analysis | ❌ | ❌ | ✅ |
| Detects gotchas/pitfalls | ❌ | ❌ | ✅ |
| Token budget analysis | ❌ | ❌ | ✅ |
| Effectiveness scoring | ❌ | Partial | ✅ |
| Stale reference detection | ❌ | ❌ | ✅ |
| Style-vs-linter warnings | ❌ | ❌ | ✅ |
| @import structure generation | ❌ | ❌ | ✅ |
| Codebase drift detection | ❌ | ❌ | ✅ |
| Git history mining | ❌ | ❌ | ✅ |
| MCP server integration | ❌ | ❌ | ✅ |
| GitHub Action | ❌ | ✅ | ✅ |
| CI/CD integration | ❌ | ✅ | ✅ |

## Commands

### `claudemd generate`

Analyzes your codebase and generates a comprehensive CLAUDE.md.

```bash
claudemd generate                    # Basic generation
claudemd generate --framework rails  # Force framework (see list below)
claudemd generate --modular          # Generate with @import structure
claudemd generate --dry-run          # Preview without writing
claudemd generate --merge            # Generate alongside existing file
claudemd generate --monorepo         # Monorepo-aware generation
```

### `claudemd lint`

Scores your CLAUDE.md on how effectively it helps Claude perform.

```bash
claudemd lint                    # Full effectiveness report
claudemd lint --fix              # Include suggested fixes
claudemd lint --strict           # Fail on warnings (CI mode)
claudemd lint --format json      # Machine-readable output
claudemd lint --preset strict    # Use strict rule preset
```

### `claudemd budget`

Shows token breakdown by section and optimization opportunities.

```bash
claudemd budget                  # Token breakdown
claudemd budget --optimize       # Include savings suggestions
claudemd budget --max-tokens 2000  # Custom token ceiling
```

### `claudemd evolve`

Detects codebase drift and suggests updates to keep your CLAUDE.md current.

```bash
claudemd evolve                  # Show drift report
claudemd evolve --apply          # Auto-apply safe updates
claudemd evolve --ci             # CI mode: exit 1 if drift detected
claudemd evolve --format json    # Machine-readable output
```

### `claudemd compare`

Compare two CLAUDE.md files with before/after effectiveness scoring.

```bash
claudemd compare old.md new.md           # Side-by-side scoring
claudemd compare old.md new.md --format json  # JSON output
```

### `claudemd serve`

Start an MCP server for Claude Desktop / Claude Code integration. Exposes 10 tools:

| Tool | Description |
|------|-------------|
| `claudemd_generate` | Analyze codebase and return generated CLAUDE.md |
| `claudemd_lint` | Score and lint a CLAUDE.md with detailed findings |
| `claudemd_score` | Quick effectiveness score (0–100) |
| `claudemd_budget` | Token breakdown by section |
| `claudemd_evolve` | Detect drift between CLAUDE.md and codebase |
| `claudemd_compare` | Before/after scoring of two CLAUDE.md files |
| `claudemd_fix` | Auto-fix suggestions for lint issues |
| `claudemd_validate` | Validate .claudemdrc config files |
| `claudemd_scan_files` | Categorize all project files by role (components, models, tests, etc.) |
| `claudemd_read_batch` | Read multiple files at once (max 20, with safety controls) |

The last two tools enable a **multi-phase deep analysis** workflow: generate a base CLAUDE.md, scan files by category, read key files from each category, then synthesize a richer result.

```bash
claudemd serve
```

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "claudemd-pro": {
      "command": "npx",
      "args": ["claudemd-pro", "serve"]
    }
  }
}
```

## Supported Frameworks

| Framework | `--framework` | Detection | Deep Analysis |
|-----------|---------------|-----------|---------------|
| Ruby on Rails | `rails` | ✅ | ✅ Models, routes, services, jobs, Hotwire |
| Next.js | `nextjs` | ✅ | ✅ App Router, Pages, API routes |
| Django | `django` | ✅ | ✅ Models, views, URLs, settings, management commands |
| Laravel | `laravel` | ✅ | ✅ Eloquent, routes, Blade, Artisan, queues |
| Phoenix | `phoenix` | ✅ | ✅ Contexts, LiveView, Ecto, channels |
| Go (Gin/Echo/Fiber) | `go` | ✅ | ✅ Handlers, middleware, modules |
| Rust (Actix/Axum) | `rust` | ✅ | ✅ Modules, traits, Cargo workspace |
| Spring Boot | `spring` | ✅ | ✅ Controllers, repositories, services, entities |
| FastAPI | `fastapi` | ✅ | ✅ Routers, Pydantic models, dependencies |
| Express.js | `express` | ✅ | ✅ Routes, middleware, error handling |
| NestJS | `nestjs` | ✅ | ✅ Controllers, modules, providers, guards, interceptors |
| Nuxt | `nuxt` | ✅ | ✅ Pages, composables, server routes, Nitro |
| Svelte/SvelteKit | `sveltekit` | ✅ | ✅ Routes, load functions, hooks, adapters |
| Astro | `astro` | ✅ | ✅ Pages, layouts, components, integrations |
| Remix | `remix` | ✅ | ✅ Routes, loaders, actions, meta functions |
| Hono | `hono` | ✅ | ✅ Routes, middleware, adapters |
| Generic | `generic` | ✅ | ✅ Fallback for any project |

## Lint Rules

| Rule | Severity | What It Checks |
|------|----------|----------------|
| `token-budget` | error | Root CLAUDE.md exceeds recommended token limit |
| `token-bloat` | warning | Single section consumes >25% of total tokens |
| `missing-verify` | error | No test/lint/typecheck commands |
| `stale-ref` | error | References files that don't exist |
| `style-vs-linter` | warning | Style rules that belong in a linter config |
| `vague` | warning | Instructions too vague to be actionable |
| `redundant` | warning | Info Claude can infer from the codebase |
| `no-architecture` | warning | Missing project structure map |
| `duplicate-content` | warning | Repeated content across sections |
| `missing-gotchas` | suggest | No pitfalls/gotchas section |
| `no-imports` | suggest | Large project without @import structure |
| `missing-patterns` | suggest | Missing key patterns section for convention-based frameworks |
| `import-candidate` | suggest | Sections that could be moved to child CLAUDE.md via @import |
| `context-efficiency` | suggest | Content that could be compressed without losing meaning |
| `commands-runnable` | warning | Referenced npm/yarn/pnpm scripts exist in package.json |
| `framework-version-sync` | warning | Stated framework version matches actual manifest |
| `depth-imbalance` | suggest | Section sizes differ by >10:1 ratio |
| `contradictory-advice` | warning | CLAUDE.md advice contradicts project state |

Rule presets: `default`, `strict`, `lean` — set via `--preset` flag or `.claudemdrc` config.

## GitHub Action

Add CLAUDE.md linting to your CI pipeline:

```yaml
# .github/workflows/claudemd.yml
name: CLAUDE.md Health Check
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: crisnahine/CLAUDEMD-PRO@v0.4.0
        with:
          threshold: 60
          strict: false
          check-drift: true
          comment-on-pr: true
```

The action outputs `score`, `errors`, `warnings`, and `drift-items` for use in subsequent steps, and annotates your PR with inline lint results.

## CI/CD Integration

For non-GitHub CI or more control, use the CLI directly:

```yaml
# Generic CI
- run: npx claudemd-pro lint --strict --format json

# With evolve drift check
- run: npx claudemd-pro evolve --ci
```

## Configuration

Create a `.claudemdrc` in your project root:

```json
{
  "preset": "default",
  "maxTokens": 3000,
  "framework": "rails",
  "output": "./CLAUDE.md",
  "modular": false,
  "exclude": ["vendor", "node_modules", ".next"],
  "rules": {
    "style-vs-linter": "error",
    "redundant": "off"
  },
  "plugins": ["claudemd-plugin-security"]
}
```

Also supports `claudemd.config.js`, `claudemd.config.ts`, or a `"claudemd"` key in `package.json` via [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig). Invalid config values are validated at load time with helpful warnings.

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Key areas where help is needed:
- Framework analyzers for new frameworks (Flutter/Dart, .NET/C#, Deno, Bun, Elixir non-Phoenix)
- CI provider analyzers (Jenkins, Azure Pipelines, Bitbucket)
- Community lint rule plugins
- Evolve auto-fix improvements
- Additional test fixtures

## Support

If claudemd-pro helps your workflow, consider supporting the project — [become a monthly sponsor or buy me a coffee](https://github.com/sponsors/crisnahine).

## License

MIT
