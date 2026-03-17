/**
 * Go (Gin / Echo / Fiber) Deep Analyzer
 *
 * Detects Go web frameworks, GORM/sqlx/pgx ORMs, Air hot-reload,
 * wire DI, cobra CLI, testify, golangci-lint, and migration tools
 * (golang-migrate / goose).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────

export interface FrameworkEnrichment {
  gotchas: Array<{ rule: string; reason: string; severity: "critical" | "important" | "nice-to-have" }>;
  dirPurposes: Record<string, string>;
  notableDeps: Array<{ name: string; pattern: string; label: string }>;
  entryPoints: string[];
  patterns: Array<{ check: string; label: string }>;
  commands: Array<{ command: string; description: string; category: "dev" | "test" | "build" | "lint" | "db" | "deploy" | "other" }>;
  database?: { ormName: string; schemaFile?: string; migrationDir?: string };
  testing?: { framework: string; testDir: string; systemTestTools?: string[] };
}

// ─── Helpers ────────────────────────────────────────────────

function readSafe(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : null;
  } catch {
    return null;
  }
}

type GoFramework = "gin" | "echo" | "fiber" | "chi" | "gorilla" | "stdlib" | "unknown";

function detectGoFramework(goMod: string): GoFramework {
  if (goMod.includes("github.com/gin-gonic/gin")) return "gin";
  if (goMod.includes("github.com/labstack/echo")) return "echo";
  if (goMod.includes("github.com/gofiber/fiber")) return "fiber";
  if (goMod.includes("github.com/go-chi/chi")) return "chi";
  if (goMod.includes("github.com/gorilla/mux")) return "gorilla";
  // Go 1.22+ stdlib routing
  if (goMod.match(/^go\s+1\.2[2-9]/m)) return "stdlib";
  return "unknown";
}

// ─── Analyzer ───────────────────────────────────────────────

export function analyzeGo(
  rootDir: string,
  keyDeps: Record<string, string>
): FrameworkEnrichment {
  const enrichment: FrameworkEnrichment = {
    gotchas: [],
    dirPurposes: {},
    notableDeps: [],
    entryPoints: [],
    patterns: [],
    commands: [],
  };

  const goMod = readSafe(join(rootDir, "go.mod")) ?? "";
  const goSum = readSafe(join(rootDir, "go.sum")) ?? "";
  const allDeps = `${goMod}\n${goSum}`;
  const goFramework = detectGoFramework(goMod);

  // Extract module name
  const moduleMatch = goMod.match(/^module\s+(.+)$/m);
  const moduleName = moduleMatch?.[1]?.trim() ?? null;

  // Extract Go version
  const goVersionMatch = goMod.match(/^go\s+(\d+\.\d+)/m);
  const goVersion = goVersionMatch?.[1] ?? null;

  // Check for Makefile
  const makefile = readSafe(join(rootDir, "Makefile")) ?? "";

  // ─── Entry Points ──────────────────────────────────────────

  // Main entry — standard Go convention is cmd/ or main.go
  const mainCandidates = [
    "cmd/server/main.go",
    "cmd/api/main.go",
    "cmd/app/main.go",
    "main.go",
    "cmd/main.go",
    "server.go",
    "app.go",
  ];

  for (const c of mainCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
      break;
    }
  }

  // Check for cmd/ subdirectories (multi-binary projects)
  if (existsSync(join(rootDir, "cmd"))) {
    try {
      const entries = readdirSync(join(rootDir, "cmd"), { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const mainFile = join("cmd", entry.name, "main.go");
          if (existsSync(join(rootDir, mainFile))) {
            if (!enrichment.entryPoints.includes(mainFile)) {
              enrichment.entryPoints.push(mainFile);
            }
          }
        }
      }
    } catch { /* permission denied */ }
  }

  // Config files
  const configCandidates = [
    "config.yaml", "config.yml", "config.json", "config.toml",
    ".env", "config/config.yaml", "config/config.yml",
  ];
  for (const c of configCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
      break;
    }
  }

  if (existsSync(join(rootDir, "go.mod"))) {
    enrichment.entryPoints.push("go.mod");
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "cmd/": "Application entry points (main packages)",
    "internal/": "Private packages (not importable by other modules)",
    "pkg/": "Public library packages (importable by external modules)",
    "api/": "API definitions (OpenAPI specs, protobuf, GraphQL schemas)",
    "configs/": "Configuration file templates",
    "config/": "Configuration file templates",
    "scripts/": "Build, install, analysis scripts",
    "deployments/": "Deployment configurations (Docker, k8s, terraform)",
    "build/": "Build/packaging scripts and Dockerfiles",
    "docs/": "Documentation",
    "tools/": "Supporting tools for the project",
    "vendor/": "Vendored dependencies (go mod vendor)",
    "web/": "Web assets, templates, SPA frontend",
    "assets/": "Static assets embedded or served",
    "testdata/": "Test fixture data",
  };

  // Go standard layout directories (if they exist)
  const goLayoutDirs: Record<string, string> = {
    "internal/server": "HTTP server setup and middleware",
    "internal/handler": "HTTP request handlers",
    "internal/handlers": "HTTP request handlers",
    "internal/routes": "Route definitions",
    "internal/router": "Router setup",
    "internal/service": "Business logic / service layer",
    "internal/services": "Business logic / service layer",
    "internal/repository": "Data access / database layer",
    "internal/repositories": "Data access / database layer",
    "internal/model": "Data models / structs",
    "internal/models": "Data models / structs",
    "internal/domain": "Domain models and interfaces",
    "internal/middleware": "HTTP middleware",
    "internal/config": "Configuration parsing / loading",
    "internal/database": "Database connection and setup",
    "internal/db": "Database connection and setup",
    "internal/auth": "Authentication / authorization",
    "internal/logger": "Logging setup",
    "internal/utils": "Utility functions",
    "internal/dto": "Data Transfer Objects",
    "internal/entity": "Database entities / domain objects",
    "internal/usecase": "Use case / application services (clean architecture)",
    "internal/delivery": "Delivery layer / transport (clean architecture)",
    "internal/infrastructure": "Infrastructure layer (clean architecture)",
    "internal/app": "Application initialization and wiring",
    "internal/worker": "Background workers / job processors",
  };

  for (const [dir, purpose] of Object.entries(goLayoutDirs)) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[`${dir}/`] = purpose;
    }
  }

  // Migration directories
  const migrationDirs = [
    "migrations", "db/migrations", "internal/db/migrations",
    "sql/migrations", "database/migrations",
  ];
  for (const dir of migrationDirs) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[`${dir}/`] = "SQL migration files";
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Web frameworks
    { name: "gin", pattern: "github.com/gin-gonic/gin", label: "Gin (HTTP framework)" },
    { name: "echo", pattern: "github.com/labstack/echo", label: "Echo (HTTP framework)" },
    { name: "fiber", pattern: "github.com/gofiber/fiber", label: "Fiber (Express-style HTTP framework)" },
    { name: "chi", pattern: "github.com/go-chi/chi", label: "Chi (lightweight router)" },
    { name: "gorilla/mux", pattern: "github.com/gorilla/mux", label: "Gorilla Mux (HTTP router)" },
    // Database / ORM
    { name: "gorm", pattern: "gorm.io/gorm", label: "GORM (ORM)" },
    { name: "sqlx", pattern: "github.com/jmoiron/sqlx", label: "sqlx (SQL extensions)" },
    { name: "pgx", pattern: "github.com/jackc/pgx", label: "pgx (PostgreSQL driver)" },
    { name: "ent", pattern: "entgo.io/ent", label: "ent (entity framework / ORM)" },
    { name: "bun", pattern: "github.com/uptrace/bun", label: "Bun (lightweight ORM)" },
    { name: "sqlc", pattern: "github.com/sqlc-dev/sqlc", label: "sqlc (SQL-to-Go codegen)" },
    // Migrations
    { name: "golang-migrate", pattern: "github.com/golang-migrate/migrate", label: "golang-migrate (DB migrations)" },
    { name: "goose", pattern: "github.com/pressly/goose", label: "goose (DB migrations)" },
    { name: "atlas", pattern: "ariga.io/atlas", label: "Atlas (schema migration tool)" },
    // Auth
    { name: "jwt-go", pattern: "github.com/golang-jwt/jwt", label: "golang-jwt (JWT tokens)" },
    { name: "casbin", pattern: "github.com/casbin/casbin", label: "Casbin (authorization)" },
    // Dependency injection
    { name: "wire", pattern: "github.com/google/wire", label: "Wire (compile-time dependency injection)" },
    { name: "fx", pattern: "go.uber.org/fx", label: "Uber Fx (dependency injection)" },
    { name: "dig", pattern: "go.uber.org/dig", label: "Uber Dig (dependency injection container)" },
    // CLI
    { name: "cobra", pattern: "github.com/spf13/cobra", label: "Cobra (CLI framework)" },
    { name: "viper", pattern: "github.com/spf13/viper", label: "Viper (configuration management)" },
    // Testing
    { name: "testify", pattern: "github.com/stretchr/testify", label: "testify (test assertions + mocks)" },
    { name: "gomock", pattern: "go.uber.org/mock", label: "gomock (mock generation)" },
    { name: "mockery", pattern: "github.com/vektra/mockery", label: "mockery (mock generation)" },
    // gRPC
    { name: "grpc", pattern: "google.golang.org/grpc", label: "gRPC" },
    { name: "protobuf", pattern: "google.golang.org/protobuf", label: "Protocol Buffers" },
    // Observability
    { name: "zap", pattern: "go.uber.org/zap", label: "Zap (structured logging)" },
    { name: "zerolog", pattern: "github.com/rs/zerolog", label: "zerolog (structured logging)" },
    { name: "slog", pattern: "log/slog", label: "slog (structured logging)" },
    { name: "otel", pattern: "go.opentelemetry.io/otel", label: "OpenTelemetry (tracing/metrics)" },
    { name: "prometheus", pattern: "github.com/prometheus/client_golang", label: "Prometheus (metrics)" },
    // Others
    { name: "validator", pattern: "github.com/go-playground/validator", label: "validator (struct validation)" },
    { name: "air", pattern: "github.com/cosmtrek/air", label: "Air (hot reload)" },
    { name: "swag", pattern: "github.com/swaggo/swag", label: "Swag (Swagger doc generation)" },
    { name: "redis", pattern: "github.com/redis/go-redis", label: "go-redis (Redis client)" },
    { name: "nats", pattern: "github.com/nats-io/nats.go", label: "NATS (messaging)" },
    { name: "kafka", pattern: "github.com/segmentio/kafka-go", label: "kafka-go (Kafka client)" },
    { name: "rabbitmq", pattern: "github.com/rabbitmq/amqp091-go", label: "RabbitMQ (AMQP)" },
    { name: "asynq", pattern: "github.com/hibiken/asynq", label: "Asynq (async task queue)" },
    { name: "embed", pattern: "embed", label: "Go embed (embedded assets)" },
  ];

  for (const dep of depChecks) {
    if (allDeps.includes(dep.pattern)) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  if (goFramework !== "unknown") {
    enrichment.patterns.push({ check: `${goFramework} framework detected`, label: `${capitalize(goFramework)} HTTP framework` });
  }

  // Clean architecture
  if (
    existsSync(join(rootDir, "internal/usecase")) ||
    existsSync(join(rootDir, "internal/delivery")) ||
    existsSync(join(rootDir, "internal/infrastructure"))
  ) {
    enrichment.patterns.push({ check: "clean arch directories", label: "Clean Architecture (usecase/delivery/infrastructure)" });
  }

  // Hex architecture
  if (
    existsSync(join(rootDir, "internal/domain")) &&
    existsSync(join(rootDir, "internal/ports"))
  ) {
    enrichment.patterns.push({ check: "hex arch directories", label: "Hexagonal Architecture (ports + adapters)" });
  }

  // Multi-binary
  if (existsSync(join(rootDir, "cmd"))) {
    try {
      const cmdEntries = readdirSync(join(rootDir, "cmd"), { withFileTypes: true });
      const binaries = cmdEntries.filter((e) => e.isDirectory());
      if (binaries.length > 1) {
        enrichment.patterns.push({
          check: "multiple cmd/ subdirs",
          label: `Multi-binary project (${binaries.map((b) => b.name).join(", ")})`,
        });
      }
    } catch { /* permission denied */ }
  }

  if (allDeps.includes("google.golang.org/grpc")) {
    enrichment.patterns.push({ check: "gRPC in deps", label: "gRPC services" });
  }

  if (allDeps.includes("github.com/google/wire")) {
    enrichment.patterns.push({ check: "Wire in deps", label: "Compile-time dependency injection (Wire)" });
  }

  if (allDeps.includes("go.uber.org/fx")) {
    enrichment.patterns.push({ check: "Fx in deps", label: "Runtime dependency injection (Uber Fx)" });
  }

  if (allDeps.includes("github.com/spf13/cobra")) {
    enrichment.patterns.push({ check: "Cobra in deps", label: "CLI with subcommands (Cobra)" });
  }

  if (allDeps.includes("go.opentelemetry.io/otel")) {
    enrichment.patterns.push({ check: "OTel in deps", label: "OpenTelemetry observability" });
  }

  if (existsSync(join(rootDir, "vendor"))) {
    enrichment.patterns.push({ check: "vendor/ directory", label: "Vendored dependencies (go mod vendor)" });
  }

  if (existsSync(join(rootDir, "proto")) || existsSync(join(rootDir, "api/proto"))) {
    enrichment.patterns.push({ check: "proto/ directory", label: "Protocol Buffer definitions" });
  }

  if (existsSync(join(rootDir, ".air.toml")) || existsSync(join(rootDir, ".air.conf"))) {
    enrichment.patterns.push({ check: ".air.toml", label: "Air hot-reload for development" });
  }

  if (allDeps.includes("github.com/sqlc-dev/sqlc")) {
    enrichment.patterns.push({ check: "sqlc in deps", label: "SQL-first with generated Go code (sqlc)" });
  }

  // Docker
  if (existsSync(join(rootDir, "Dockerfile"))) {
    enrichment.patterns.push({ check: "Dockerfile", label: "Docker containerization" });
  }

  // ─── Commands ──────────────────────────────────────────────

  enrichment.commands.push(
    { command: "go run ./cmd/server", description: "Run the application", category: "dev" },
    { command: "go test ./...", description: "Run all tests", category: "test" },
    { command: "go test -v ./...", description: "Run tests (verbose output)", category: "test" },
    { command: "go test -race ./...", description: "Run tests with race detector", category: "test" },
    { command: "go test -cover ./...", description: "Run tests with coverage", category: "test" },
    { command: "go build ./...", description: "Build all packages", category: "build" },
    { command: "go vet ./...", description: "Run Go vet (static analysis)", category: "lint" },
    { command: "go mod tidy", description: "Clean up go.mod/go.sum", category: "build" },
    { command: "go mod download", description: "Download dependencies", category: "build" },
  );

  // Air hot-reload
  if (existsSync(join(rootDir, ".air.toml")) || existsSync(join(rootDir, ".air.conf")) || allDeps.includes("cosmtrek/air")) {
    enrichment.commands.push(
      { command: "air", description: "Start dev server with hot reload (Air)", category: "dev" },
    );
  }

  // golangci-lint
  if (existsSync(join(rootDir, ".golangci.yml")) || existsSync(join(rootDir, ".golangci.yaml"))) {
    enrichment.commands.push(
      { command: "golangci-lint run", description: "Run golangci-lint (combined linters)", category: "lint" },
    );
  }

  // golang-migrate
  if (allDeps.includes("github.com/golang-migrate/migrate")) {
    const migDir = findMigrationDir(rootDir);
    enrichment.commands.push(
      { command: `migrate -path ${migDir} -database "$DATABASE_URL" up`, description: "Apply pending DB migrations", category: "db" },
      { command: `migrate -path ${migDir} -database "$DATABASE_URL" down 1`, description: "Rollback last migration", category: "db" },
      { command: `migrate create -ext sql -dir ${migDir} -seq name`, description: "Create new migration files", category: "db" },
    );
  }

  // goose
  if (allDeps.includes("github.com/pressly/goose")) {
    const migDir = findMigrationDir(rootDir);
    enrichment.commands.push(
      { command: `goose -dir ${migDir} up`, description: "Apply pending DB migrations (goose)", category: "db" },
      { command: `goose -dir ${migDir} down`, description: "Rollback last migration (goose)", category: "db" },
      { command: `goose -dir ${migDir} create name sql`, description: "Create new SQL migration (goose)", category: "db" },
      { command: `goose -dir ${migDir} status`, description: "Show migration status (goose)", category: "db" },
    );
  }

  // Wire
  if (allDeps.includes("github.com/google/wire")) {
    enrichment.commands.push(
      { command: "wire ./...", description: "Generate Wire dependency injection code", category: "build" },
    );
  }

  // Swag
  if (allDeps.includes("github.com/swaggo/swag")) {
    enrichment.commands.push(
      { command: "swag init", description: "Generate Swagger documentation", category: "other" },
    );
  }

  // sqlc
  if (allDeps.includes("github.com/sqlc-dev/sqlc")) {
    enrichment.commands.push(
      { command: "sqlc generate", description: "Generate Go code from SQL queries", category: "build" },
    );
  }

  // Protobuf
  if (existsSync(join(rootDir, "proto")) || existsSync(join(rootDir, "api/proto"))) {
    enrichment.commands.push(
      { command: "protoc --go_out=. --go-grpc_out=. proto/*.proto", description: "Generate Go code from protobuf", category: "build" },
    );
  }

  // Docker
  if (existsSync(join(rootDir, "docker-compose.yml")) || existsSync(join(rootDir, "compose.yml"))) {
    enrichment.commands.push(
      { command: "docker compose up -d", description: "Start infrastructure services (DB, Redis, etc.)", category: "dev" },
    );
  }

  // Makefile targets (most Go projects use Makefile)
  if (makefile) {
    enrichment.commands.push(
      { command: "make", description: "Run default Makefile target", category: "build" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  if (allDeps.includes("gorm.io/gorm")) {
    enrichment.database = { ormName: "GORM" };
  } else if (allDeps.includes("entgo.io/ent")) {
    enrichment.database = { ormName: "ent" };
  } else if (allDeps.includes("github.com/uptrace/bun")) {
    enrichment.database = { ormName: "Bun" };
  } else if (allDeps.includes("github.com/jmoiron/sqlx")) {
    enrichment.database = { ormName: "sqlx (raw SQL + struct scanning)" };
  } else if (allDeps.includes("github.com/jackc/pgx")) {
    enrichment.database = { ormName: "pgx (PostgreSQL driver, no ORM)" };
  } else if (allDeps.includes("github.com/sqlc-dev/sqlc")) {
    enrichment.database = { ormName: "sqlc (generated from SQL)" };
  }

  if (enrichment.database) {
    const migDir = findMigrationDir(rootDir);
    if (migDir !== "migrations") {
      enrichment.database.migrationDir = migDir;
    } else if (existsSync(join(rootDir, "migrations"))) {
      enrichment.database.migrationDir = "migrations";
    }
  }

  // ─── Testing ───────────────────────────────────────────────

  enrichment.testing = {
    framework: "go test",
    testDir: "*_test.go (colocated)",
    systemTestTools: [],
  };

  if (allDeps.includes("github.com/stretchr/testify")) {
    enrichment.testing.systemTestTools!.push("testify (assertions + mocks)");
  }
  if (allDeps.includes("go.uber.org/mock") || allDeps.includes("github.com/golang/mock")) {
    enrichment.testing.systemTestTools!.push("gomock (interface mocking)");
  }
  if (allDeps.includes("github.com/vektra/mockery")) {
    enrichment.testing.systemTestTools!.push("mockery (mock generation)");
  }
  if (allDeps.includes("github.com/testcontainers/testcontainers-go")) {
    enrichment.testing.systemTestTools!.push("testcontainers-go (Docker-based integration tests)");
  }
  if (allDeps.includes("github.com/gavv/httpexpect")) {
    enrichment.testing.systemTestTools!.push("httpexpect (HTTP API testing)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T modify files in vendor/ or generated code",
      reason: "vendor/ is auto-generated by `go mod vendor`. Generated files (wire_gen.go, *_mock.go, *.pb.go) are produced by tools. Edit source and re-run generators",
      severity: "critical",
    },
    {
      rule: "DON'T ignore errors — always check the `err` return value",
      reason: "Go functions return errors as values. Ignoring them (`_, _ = fn()`) hides bugs. Use golangci-lint's errcheck linter to catch these",
      severity: "critical",
    },
    {
      rule: "DON'T use `panic()` for error handling in library code",
      reason: "panic() crashes the entire program. Return errors instead. Only use panic for truly unrecoverable situations (programmer errors, not runtime errors)",
      severity: "important",
    },
    {
      rule: "DON'T use `init()` functions for complex setup",
      reason: "init() runs automatically at import time, making testing difficult and hiding dependencies. Prefer explicit initialization in main()",
      severity: "important",
    },
    {
      rule: "DON'T use package-level mutable state",
      reason: "Global variables cause data races in concurrent code and make testing hard. Pass dependencies explicitly (via structs or function parameters)",
      severity: "important",
    },
    {
      rule: "DON'T forget to close resources (files, DB connections, HTTP response bodies)",
      reason: "Use `defer resource.Close()` immediately after opening. Go has no destructors — unclosed resources cause leaks",
      severity: "critical",
    },
    {
      rule: "DON'T use `go func()` without error handling or context cancellation",
      reason: "Goroutines that panic silently or run forever cause resource leaks. Always pass context.Context and handle errors in goroutines",
      severity: "important",
    },
    {
      rule: "ALWAYS use `context.Context` as the first parameter in API functions",
      reason: "Context carries deadlines, cancellation signals, and request-scoped values. It's the standard Go pattern for all I/O operations",
      severity: "important",
    },
    {
      rule: "DON'T use database/sql directly for complex queries without parameterization",
      reason: "Always use `?` or `$1` placeholders. String concatenation in SQL opens injection vulnerabilities. Use sqlx or GORM for safer query building",
      severity: "critical",
    },
    {
      rule: "DON'T import packages from internal/ outside the parent module",
      reason: "Go enforces that internal/ packages are only importable by code in the parent directory tree. This is by design — respect it",
      severity: "nice-to-have",
    },
  );

  // GORM-specific gotchas
  if (allDeps.includes("gorm.io/gorm")) {
    enrichment.gotchas.push(
      {
        rule: "DON'T use GORM's AutoMigrate in production",
        reason: "AutoMigrate only adds columns, never removes them. Use proper migration tools (golang-migrate, goose, Atlas) for production schema changes",
        severity: "critical",
      },
      {
        rule: "DON'T forget to check `RowsAffected` after GORM updates/deletes",
        reason: "GORM doesn't return an error when a WHERE clause matches no rows. Check `result.RowsAffected == 0` to detect missing records",
        severity: "important",
      },
    );
  }

  // Gorilla/mux deprecation note
  if (allDeps.includes("github.com/gorilla/mux") && goVersion && parseFloat(goVersion) >= 1.22) {
    enrichment.gotchas.push({
      rule: "Consider migrating from gorilla/mux to Go 1.22+ stdlib routing",
      reason: "Go 1.22+ net/http.ServeMux supports method-based routing and path parameters natively. gorilla/mux is archived",
      severity: "nice-to-have",
    });
  }

  return enrichment;
}

// ─── Utilities ──────────────────────────────────────────────

function findMigrationDir(rootDir: string): string {
  const candidates = [
    "migrations",
    "db/migrations",
    "internal/db/migrations",
    "sql/migrations",
    "database/migrations",
  ];
  for (const c of candidates) {
    if (existsSync(join(rootDir, c))) return c;
  }
  return "migrations";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
