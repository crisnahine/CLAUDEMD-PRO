# claudemd-pro

> Deep codebase-aware CLAUDE.md generator, linter, and effectiveness scorer.

Your CLAUDE.md is the highest-leverage file in your AI coding workflow. A good one makes Claude perform like a senior teammate. A bad one wastes tokens and actively hurts performance.

**claudemd-pro** goes beyond `/init` and basic schema linting. It deeply analyzes your codebase — architecture, patterns, dependencies, CI config, known pitfalls — and produces an effective CLAUDE.md that actually helps.

## Features

- **Generate** — Analyze your codebase and produce a battle-tested CLAUDE.md
- **Lint** — Score your existing CLAUDE.md on *effectiveness*, not just structure
- **Budget** — See exactly where your tokens are going and how to optimize
- **Evolve** — Detect codebase drift and keep your CLAUDE.md in sync automatically
- **Compare** — Before/after scoring to measure your CLAUDE.md improvements
- **MCP Server** — Integrate directly with Claude Desktop and Claude Code
- **GitHub Action** — Lint your CLAUDE.md on every push/PR with annotations
- **Framework-Aware** — Deep analysis for Rails, Next.js, Django, Laravel, Phoenix, Go, Rust, Spring, FastAPI
- **Git History Mining** — Extract patterns and conventions from your commit history
- **CI-Ready** — JSON output, strict mode, exit codes for pipeline integration

## Quick Start

```bash
# Generate a CLAUDE.md for your project
npx claudemd-pro generate

# Lint an existing CLAUDE.md
npx claudemd-pro lint

# Quick effectiveness score
npx claudemd-pro score

# Token budget breakdown
npx claudemd-pro budget --optimize

# Detect drift since last generation
npx claudemd-pro evolve

# Compare before/after
npx claudemd-pro compare old-CLAUDE.md new-CLAUDE.md
```

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
claudemd generate --framework rails  # Force framework detection
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

Start an MCP server for Claude Desktop / Claude Code integration.

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

| Framework | Detection | Deep Analysis |
|-----------|-----------|---------------|
| Ruby on Rails | ✅ | ✅ Models, routes, services, jobs, Hotwire |
| Next.js | ✅ | ✅ App Router, Pages, API routes |
| Django | ✅ | ✅ Models, views, URLs, settings, management commands |
| Laravel | ✅ | ✅ Eloquent, routes, Blade, Artisan, queues |
| Phoenix | ✅ | ✅ Contexts, LiveView, Ecto, channels |
| Go (Gin/Echo/Fiber) | ✅ | ✅ Handlers, middleware, modules |
| Rust (Actix/Axum) | ✅ | ✅ Modules, traits, Cargo workspace |
| Spring Boot | ✅ | ✅ Controllers, repositories, services, entities |
| FastAPI | ✅ | ✅ Routers, Pydantic models, dependencies |
| Express.js | ✅ | ✅ Fallback via generic analysis |
| Generic | ✅ | ✅ Fallback for any project |

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
      - uses: your-org/claudemd-pro@v0.2.0
        with:
          threshold: 60
          strict: false
```

The action outputs `score`, `errors`, and `warnings` for use in subsequent steps, and annotates your PR with inline lint results.

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

Also supports `claudemd.config.js`, `claudemd.config.ts`, or a `"claudemd"` key in `package.json` via [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig).

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Key areas where help is needed:
- Framework analyzers for new frameworks (Svelte/SvelteKit, Nuxt, Remix, Astro, NestJS, Hono)
- Community lint rule plugins
- Evolve auto-fix improvements
- Additional test fixtures

## Support

If claudemd-pro helps your workflow, consider supporting the project — [become a monthly sponsor or buy me a coffee](https://github.com/sponsors/crisnahine).

## License

MIT
