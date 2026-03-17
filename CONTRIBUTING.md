# Contributing to claudemd-pro

Thanks for your interest in contributing! Here's how to get started.

## Setup

```bash
git clone https://github.com/crisnahine/CLAUDEMD-PRO.git
cd claudemd-pro
npm install
npm run test        # Verify everything works
```

## Development Workflow

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Run `npm run typecheck && npm run test:run`
4. Open a PR with a clear description

## Where to Contribute

### Framework Analyzers (High Impact)
Add deep analysis for new frameworks in `src/frameworks/`. Each analyzer should:
- Read framework-specific config files
- Extract patterns, conventions, and gotchas
- Return a typed profile the generator can use
- Include tests with fixture projects in `tests/fixtures/`

Currently implemented: Rails, Next.js, Django, Laravel, Phoenix, Go, Rust, Spring, FastAPI, NestJS, Nuxt, Svelte/SvelteKit, Astro, Remix, Hono.

**New targets:** Flutter/Dart, .NET/C#, Deno, Bun, Elixir non-Phoenix

### Lint Rules (Medium Impact)
Add new effectiveness rules in `src/linter/rules/`. Each rule must implement the `LintRule` interface from `src/linter/types.ts`:

```typescript
interface LintRule {
  id: string;
  severity: Severity;
  description: string;
  run(ctx: LintContext): LintResult[];
}
```

Rules are modular — one file per rule. See existing rules in `src/linter/rules/` for examples. Include test cases for each new rule.

### Community Plugins
Build plugin packages that export additional `LintRule` arrays. Plugins are loaded via the `plugins` field in `.claudemdrc` config.

### MCP Tools
Extend the MCP server in `src/mcp/` with new tools for Claude Desktop / Claude Code integration.

### CI Provider Analyzers (Medium Impact)
Add analyzers for CI systems beyond GitHub Actions in `src/analyzers/`. Targets: Jenkins, Azure Pipelines, Bitbucket Pipelines, CircleCI.

### Database Analyzer Extensions (Medium Impact)
Extend database analysis in `src/analyzers/` with support for MongoDB, SeaORM, and other ORMs/databases not yet covered.

### Config Plugins
Build config plugin packages that extend `.claudemdrc` with custom options and validation.

### Evolve Auto-Fix
Improve the drift detection engine in `src/evolve/` — better heuristics for detecting when CLAUDE.md sections have gone stale, and safer auto-apply logic.

### Test Fixtures
Add fixture projects in `tests/fixtures/` for frameworks and project types that aren't well covered yet. Good fixtures make it easy to test analyzers and catch regressions.

## Code Style

- TypeScript strict mode
- ESM imports with `.js` extensions
- Prefer `node:fs` over `fs` for built-in modules
- Use explicit return types on exported functions
- Tests go in `tests/` mirroring the `src/` structure

## Commit Messages

Use conventional commits:
```
feat(rails): add Sidekiq job pattern detection
fix(lint): false positive on stale-ref with monorepo paths
docs: add Django analyzer example
```
