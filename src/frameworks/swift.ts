/**
 * Swift (Vapor) Deep Analyzer
 *
 * Detects Swift/Vapor-specific patterns, Fluent ORM, Leaf templating,
 * JWT authentication, queues, and common gotchas.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { FrameworkEnrichment } from "./go.js";

export type { FrameworkEnrichment };

// ─── Helpers ────────────────────────────────────────────────

function readSafe(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : null;
  } catch {
    return null;
  }
}

// ─── Analyzer ───────────────────────────────────────────────

export function analyzeSwift(
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

  // Read Package.swift for dependencies
  const packageSwift = readSafe(join(rootDir, "Package.swift")) ?? "";

  const hasDep = (pattern: string): boolean => {
    return packageSwift.includes(pattern) || !!keyDeps[pattern];
  };

  // Detect Vapor
  const isVapor = hasDep("vapor/vapor") || hasDep("vapor.git");
  const hasFluent = hasDep("vapor/fluent") || hasDep("fluent.git");
  const hasLeaf = hasDep("vapor/leaf") || hasDep("leaf.git");
  const hasJWT = hasDep("vapor/jwt") || hasDep("jwt.git");

  // Detect database driver
  const hasPostgres = hasDep("fluent-postgres-driver") || hasDep("postgres-nio");
  const hasMySQL = hasDep("fluent-mysql-driver") || hasDep("mysql-nio");
  const hasSQLite = hasDep("fluent-sqlite-driver");
  const hasMongo = hasDep("fluent-mongo-driver") || hasDep("mongo-driver");

  // Extract Swift tools version
  const swiftVersionMatch = packageSwift.match(/swift-tools-version:\s*(\d+\.\d+)/);
  const swiftToolsVersion = swiftVersionMatch?.[1] ?? null;

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "Sources/App/configure.swift",
    "Sources/App/routes.swift",
    "Sources/App/entrypoint.swift",
    "Sources/Run/main.swift",
    "Sources/App/app.swift",
    "Package.swift",
    "docker-compose.yml",
  ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "Sources/": "Swift source code root",
    "Sources/App/": "Main application module",
    "Tests/": "Test target root",
    "Package.swift": "Swift Package Manager manifest (dependencies + targets)",
  };

  if (isVapor) {
    const vaporDirs: Record<string, string> = {
      "Sources/App/Controllers/": "Route controller classes (request handlers)",
      "Sources/App/Models/": "Fluent model definitions (database entities)",
      "Sources/App/Migrations/": "Database migration files (schema changes)",
      "Sources/App/DTOs/": "Data Transfer Objects (API request/response types)",
      "Sources/App/Middleware/": "Custom Vapor middleware",
      "Sources/App/Routes/": "Route group definitions",
      "Sources/App/Services/": "Business logic and service layer",
      "Sources/App/Jobs/": "Background job definitions (Queues)",
      "Sources/App/Commands/": "Custom Vapor CLI commands",
      "Sources/App/Content/": "Codable request/response content types",
      "Sources/App/Extensions/": "Swift extensions and protocol conformances",
      "Sources/App/Errors/": "Custom error types and abort errors",
      "Sources/Run/": "Application entry point (main.swift)",
      "Resources/": "Runtime resources (Leaf templates, localization)",
      "Resources/Views/": "Leaf template files (.leaf)",
      "Public/": "Static files served by Vapor (CSS, JS, images)",
    };

    for (const [dir, purpose] of Object.entries(vaporDirs)) {
      if (existsSync(join(rootDir, dir))) {
        enrichment.dirPurposes[dir] = purpose;
      } else if (dir.startsWith("Sources/App/Controllers") || dir.startsWith("Sources/App/Models") || dir.startsWith("Sources/App/Migrations")) {
        // Always include critical Vapor dirs for awareness
        enrichment.dirPurposes[dir] = purpose;
      }
    }
  }

  const conditionalDirs: Record<string, string> = {
    "Tests/AppTests/": "Application unit and integration tests",
    "Tests/AppTests/Controllers/": "Controller integration tests",
    ".build/": "Swift build artifacts (SPM build cache)",
    "Scripts/": "Build and deployment scripts",
    "Docker/": "Docker configuration files",
  };

  for (const [dir, purpose] of Object.entries(conditionalDirs)) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[dir] = purpose;
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Vapor core
    { name: "vapor", pattern: "vapor/vapor", label: "Vapor (Swift web framework)" },
    // Fluent ORM
    { name: "fluent", pattern: "vapor/fluent", label: "Fluent ORM (Vapor's database abstraction)" },
    { name: "fluent-postgres-driver", pattern: "fluent-postgres-driver", label: "Fluent PostgreSQL driver" },
    { name: "fluent-mysql-driver", pattern: "fluent-mysql-driver", label: "Fluent MySQL driver" },
    { name: "fluent-sqlite-driver", pattern: "fluent-sqlite-driver", label: "Fluent SQLite driver" },
    { name: "fluent-mongo-driver", pattern: "fluent-mongo-driver", label: "Fluent MongoDB driver" },
    // Templating
    { name: "leaf", pattern: "vapor/leaf", label: "Leaf (Vapor templating engine)" },
    // Auth
    { name: "jwt", pattern: "vapor/jwt", label: "JWT (JSON Web Token authentication)" },
    { name: "jwt-kit", pattern: "jwt-kit", label: "JWT Kit (low-level JWT library)" },
    // Queues
    { name: "queues", pattern: "vapor/queues", label: "Vapor Queues (background job processing)" },
    { name: "queues-redis-driver", pattern: "queues-redis-driver", label: "Queues Redis driver" },
    // Redis
    { name: "redis", pattern: "vapor/redis", label: "Vapor Redis integration" },
    // APNS
    { name: "apns", pattern: "vapor/apns", label: "APNs (Apple Push Notification service)" },
    // WebSocket
    { name: "websocket-kit", pattern: "websocket-kit", label: "WebSocket Kit" },
    // Swift packages
    { name: "swift-nio", pattern: "apple/swift-nio", label: "SwiftNIO (event-driven networking)" },
    { name: "swift-log", pattern: "apple/swift-log", label: "Swift Logging API" },
    { name: "swift-metrics", pattern: "apple/swift-metrics", label: "Swift Metrics API" },
    { name: "swift-crypto", pattern: "apple/swift-crypto", label: "Swift Crypto" },
    { name: "swift-argument-parser", pattern: "swift-argument-parser", label: "Swift Argument Parser (CLI)" },
    // Async
    { name: "async-kit", pattern: "async-kit", label: "Async Kit (EventLoopFuture utilities)" },
    // Multipart
    { name: "multipart-kit", pattern: "multipart-kit", label: "Multipart Kit (file uploads)" },
    // Monitoring
    { name: "vapor-monitoring", pattern: "vapor-monitoring", label: "Vapor Monitoring" },
    // OpenAPI
    { name: "vapor-openapi", pattern: "vapor-openapi", label: "Vapor OpenAPI" },
  ];

  for (const dep of depChecks) {
    if (hasDep(dep.pattern)) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  if (isVapor) {
    enrichment.patterns.push({ check: "Vapor detected", label: `Vapor web framework${swiftToolsVersion ? ` (Swift ${swiftToolsVersion})` : ""}` });
  }

  enrichment.patterns.push({ check: "Swift Package Manager", label: "Swift Package Manager (dependency management)" });

  if (hasFluent) {
    enrichment.patterns.push({ check: "Fluent detected", label: "Fluent ORM (model-based database abstraction)" });
  }

  if (hasLeaf) {
    enrichment.patterns.push({ check: "Leaf detected", label: "Leaf templating (server-side HTML rendering)" });
  }

  if (hasJWT) {
    enrichment.patterns.push({ check: "JWT detected", label: "JWT-based authentication" });
  }

  if (hasDep("vapor/queues")) {
    enrichment.patterns.push({ check: "Queues detected", label: "Background job processing (Vapor Queues)" });
  }

  if (hasDep("apple/swift-nio")) {
    enrichment.patterns.push({ check: "SwiftNIO detected", label: "SwiftNIO event-driven networking" });
  }

  // Check for async/await vs EventLoopFuture
  const configureSwift = readSafe(join(rootDir, "Sources/App/configure.swift")) ?? "";
  const routesSwift = readSafe(join(rootDir, "Sources/App/routes.swift")) ?? "";
  const sourceContent = `${configureSwift}\n${routesSwift}`;

  if (sourceContent.includes("async") && sourceContent.includes("await")) {
    enrichment.patterns.push({ check: "Async/await", label: "Swift async/await concurrency" });
  }

  if (sourceContent.includes("EventLoopFuture")) {
    enrichment.patterns.push({ check: "EventLoopFuture", label: "EventLoopFuture-based async (legacy pattern)" });
  }

  // Docker
  if (existsSync(join(rootDir, "Dockerfile"))) {
    enrichment.patterns.push({ check: "Dockerfile", label: "Docker containerization" });
  }

  // ─── Commands ──────────────────────────────────────────────

  enrichment.commands.push(
    { command: "swift build", description: "Build the Swift package", category: "build" },
    { command: "swift test", description: "Run all tests", category: "test" },
    { command: "swift test --parallel", description: "Run tests in parallel", category: "test" },
    { command: "swift package resolve", description: "Resolve and fetch dependencies", category: "build" },
    { command: "swift package clean", description: "Clean build artifacts", category: "build" },
  );

  if (isVapor) {
    enrichment.commands.push(
      { command: "swift run App serve", description: "Start Vapor server", category: "dev" },
      { command: "swift run App serve --env production", description: "Start Vapor in production mode", category: "deploy" },
      { command: "swift run App routes", description: "List all registered routes", category: "other" },
    );

    if (hasFluent) {
      enrichment.commands.push(
        { command: "swift run App migrate", description: "Run pending Fluent migrations", category: "db" },
        { command: "swift run App migrate --revert", description: "Revert last Fluent migration", category: "db" },
        { command: "swift run App migrate --revert-all", description: "Revert all Fluent migrations", category: "db" },
      );
    }

    // Vapor toolbox
    if (existsSync(join(rootDir, ".vapor.yml")) || existsSync(join(rootDir, ".vapor"))) {
      enrichment.commands.push(
        { command: "vapor run serve", description: "Start Vapor via Vapor Toolbox", category: "dev" },
        { command: "vapor run migrate", description: "Run migrations via Vapor Toolbox", category: "db" },
        { command: "vapor build", description: "Build via Vapor Toolbox", category: "build" },
      );
    }
  }

  // Docker
  if (existsSync(join(rootDir, "docker-compose.yml")) || existsSync(join(rootDir, "compose.yml"))) {
    enrichment.commands.push(
      { command: "docker compose up -d", description: "Start infrastructure services (DB, Redis)", category: "dev" },
      { command: "docker compose up -d db", description: "Start database service only", category: "dev" },
    );
  }

  if (existsSync(join(rootDir, "Dockerfile"))) {
    enrichment.commands.push(
      { command: "docker build -t app .", description: "Build Docker image", category: "deploy" },
    );
  }

  // Linting
  if (existsSync(join(rootDir, ".swiftlint.yml"))) {
    enrichment.commands.push(
      { command: "swiftlint", description: "Run SwiftLint (code style linter)", category: "lint" },
      { command: "swiftlint --fix", description: "Auto-fix SwiftLint violations", category: "lint" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  if (hasFluent) {
    const driver = hasPostgres ? "PostgreSQL" : hasMySQL ? "MySQL" : hasSQLite ? "SQLite" : hasMongo ? "MongoDB" : "unknown";
    enrichment.database = {
      ormName: `Fluent (${driver})`,
      migrationDir: existsSync(join(rootDir, "Sources/App/Migrations")) ? "Sources/App/Migrations/" : undefined,
    };
  }

  // ─── Testing ───────────────────────────────────────────────

  enrichment.testing = {
    framework: "XCTest",
    testDir: "Tests/",
    systemTestTools: [],
  };

  if (isVapor) {
    enrichment.testing.systemTestTools!.push("XCTVapor (Vapor test utilities)");
  }

  // Check for async test support
  if (swiftToolsVersion && parseFloat(swiftToolsVersion) >= 5.5) {
    enrichment.testing.systemTestTools!.push("Swift Testing (async test support)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T block EventLoop threads with synchronous I/O",
      reason: "Vapor runs on SwiftNIO's event loops. Blocking an event loop thread (with synchronous file reads, sleep, etc.) halts all connections on that loop. Use async/await or EventLoopFuture for all I/O",
      severity: "critical",
    },
    {
      rule: "DON'T forget to register routes in configure.swift",
      reason: "Routes defined in separate files must be called from configure.swift (or routes.swift) to be registered with Vapor's router. Unregistered routes silently return 404",
      severity: "important",
    },
    {
      rule: "DON'T use synchronous I/O in request handlers",
      reason: "Request handlers run on SwiftNIO event loops. Synchronous operations (blocking HTTP calls, file reads, database queries) starve the event loop. Always use async versions of I/O operations",
      severity: "critical",
    },
    {
      rule: "ALWAYS use Fluent migrations for schema changes",
      reason: "Direct database schema changes bypass Fluent's migration tracking. This causes schema drift between environments. Always create a new Migration struct for every schema modification",
      severity: "critical",
    },
    {
      rule: "DON'T store secrets in configure.swift or hardcode them",
      reason: "Configuration files are committed to source control. Use Environment.get() to read secrets from environment variables, or use .env files for local development (added to .gitignore)",
      severity: "important",
    },
    {
      rule: "DON'T expose Fluent models directly in API responses",
      reason: "Fluent models contain database metadata and relationships. Create dedicated Content structs (DTOs) for API responses to control serialization and prevent data leaks",
      severity: "important",
    },
    {
      rule: "DON'T forget to add .migrationAutoRun in configure.swift for development",
      reason: "Fluent does not run migrations automatically. Call app.autoMigrate() or use `swift run App migrate` before starting the server. Forgetting this causes 'table not found' errors",
      severity: "important",
    },
    {
      rule: "DON'T capture self strongly in EventLoopFuture closures",
      reason: "Strong references to self in future chains can cause retain cycles and memory leaks. Use [weak self] or [unowned self] in closure capture lists, or prefer async/await which avoids this issue",
      severity: "important",
    },
  );

  return enrichment;
}
