# claudemd-pro

## Critical Context
- TypeScript 5.6+ / Node.js 20+
- CLI tool distributed via npm / npx
- Zero runtime dependencies on AI APIs (pure static analysis)
- ESM-only (type: module)
- Key dependencies: commander (CLI), chalk (output), cosmiconfig (config), tiktoken (token counting)

## Commands
```
npm run dev                          # Run CLI in dev mode via tsx
npm run build                        # Build with tsup
npm run test                         # Run vitest in watch mode
npm run test:run                     # Run vitest once (CI)
npm run typecheck                    # tsc --noEmit
npm run lint                         # ESLint
```

## Architecture
```
/src/cli/          # CLI entry + command handlers (generate, lint, budget, evolve, compare, serve, install)
/src/core/         # Shared logic modules reused by CLI and MCP (generate, lint)
/src/analyzers/    # Codebase analysis modules (stack, arch, db, testing, gotchas, git-history, file-scanner, file-reader, domain-analyzer, style-analyzer)
/src/frameworks/   # Framework-specific deep analyzers (13 frameworks)
/src/linter/       # Modular lint rules + scoring engine
/src/linter/rules/ # Individual lint rule modules (18 rules)
/src/linter/presets/ # Rule presets (default, strict, lean)
/src/token/        # Token counting via tiktoken with chars/4 fallback
/src/config/       # .claudemdrc config loading + validation via cosmiconfig
/src/evolve/       # Drift detection engine
/src/mcp/          # MCP server for Claude Desktop/Code integration (10 tools)
/src/github-action/ # GitHub Action wrapper (lint + drift check + PR comments)
/tests/            # Vitest test suite (141 tests)
/tests/fixtures/   # Sample project directories (rails, nextjs, django, go, laravel, fastapi, spring, monorepo, minimal)
```

## Key Patterns
- Each analyzer is independent and returns a typed profile interface
- Analyzers run in parallel via Promise.all with safeAnalyze wrapper
- 6-phase pipeline: stack → file scan → architecture → domain deep dive → style extraction → render
- Generator renders sections from the unified CodebaseProfile
- Lint rules are modular: each rule is a LintRule object in /src/linter/rules/
- Rule presets control which rules run and their severity
- Token counting uses tiktoken (cl100k_base) with chars/4 fallback
- Config loaded via cosmiconfig from .claudemdrc, claudemd.config.js, etc.
- Scoring engine uses weighted dimensions to avoid double-counting penalties
- Core modules in /src/core/ are shared between CLI and MCP server

## Gotchas — DON'T Do This
- DON'T import from node:fs/promises — use sync fs for simplicity in analyzers
- DON'T add AI API calls — this tool is pure static analysis
- DON'T break ESM imports — always use .js extension in import paths
- DON'T modify test fixtures in /tests/fixtures/ without updating corresponding tests
- ALWAYS run `npm run typecheck` before committing
