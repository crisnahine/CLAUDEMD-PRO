# claudemd-pro

## Critical Context
- Typescript 5.6.0
- Node.js >=20.0.0
- Testing: vitest (~26 tests)

## Commands
```
npm run dev                         # Run TypeScript with tsx
npm run test                        # Run Vitest test suite
npm run test:run                    # Run Vitest test suite
npm run lint                        # Run ESLint
npm run typecheck                   # TypeScript type checking
npm run build                       # Bundle with tsup
npm run prepublishOnly              # Run prepublishOnly
```

## Architecture
```
/tests/                        # Tests (100 files)
/src/                          # Source code (80 files)
/src/linter/                   # Linting rules and engine (31 files)
/src/frameworks/               # Framework-specific modules (19 files)
/src/analyzers/                # Analysis modules (15 files)
/src/cli/                      # CLI entry points and commands (7 files)
/src/config/                   # Project directory (2 files)
/src/core/                     # Core shared logic (2 files)
/src/evolve/                   # Drift detection (1 files)
/src/github-action/            # Project directory (1 files)
/src/mcp/                      # MCP server integration (1 files)
/src/token/                    # Token processing (1 files)
```

## Coding Conventions
- **Naming:** File naming: kebab-case
- **Functions:** Function declarations preferred over arrow functions
- **Async:** async/await preferred (no .then() chains)
- **TypeScript:** Interfaces preferred over type aliases for object shapes
- **Testing:** describe/it block structure
- **Imports:** named imports preferred
- **Exports:** named exports (no default)

## Gotchas — DON'T Do This
- DON'T use `any` — prefer `unknown` with type narrowing — `any` disables type checking and defeats the purpose of TypeScript
- ALWAYS use .js extension in ESM import paths — TypeScript requires .js extensions in output-relative imports for ESM
