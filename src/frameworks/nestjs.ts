/**
 * NestJS Deep Analyzer
 *
 * Detects NestJS-specific patterns, modules, decorators, TypeORM/Prisma
 * integration, Swagger docs, GraphQL, microservices, and common gotchas.
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

export function analyzeNestjs(
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

  const pkgJson = readSafe(join(rootDir, "package.json"));
  const allDeps = pkgJson ? JSON.parse(pkgJson) : {};
  const deps = {
    ...(allDeps.dependencies ?? {}),
    ...(allDeps.devDependencies ?? {}),
  };

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "src/main.ts",
    "src/app.module.ts",
    "nest-cli.json",
    "tsconfig.build.json",
  ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "src/": "Application source code",
    "src/modules/": "Feature modules (NestJS module-based architecture)",
    "src/controllers/": "HTTP request handlers (decorated with @Controller)",
    "src/services/": "Business logic providers (decorated with @Injectable)",
    "src/guards/": "Route guards for authentication/authorization",
    "src/pipes/": "Input validation and data transformation pipes",
    "src/interceptors/": "Request/response interceptors (logging, caching, transforms)",
    "src/decorators/": "Custom decorators (parameter, method, class)",
    "src/dto/": "Data Transfer Objects (request/response validation schemas)",
    "src/entities/": "Database entity definitions (TypeORM/MikroORM/Prisma models)",
    "src/filters/": "Exception filters for error handling",
    "src/interfaces/": "TypeScript interfaces and type definitions",
    "src/middleware/": "HTTP middleware functions",
    "src/config/": "Configuration modules and environment setup",
    "test/": "End-to-end (e2e) tests",
  };

  // Only include dirs that exist
  const conditionalDirs: Record<string, string> = {
    "src/common/": "Shared utilities, decorators, and cross-cutting concerns",
    "src/auth/": "Authentication module (JWT, Passport strategies)",
    "src/database/": "Database module and connection configuration",
    "src/graphql/": "GraphQL resolvers, schemas, and types",
    "src/microservices/": "Microservice transport and message patterns",
    "src/jobs/": "Background job processors (Bull/BullMQ queues)",
    "src/events/": "Event emitters and handlers",
    "src/health/": "Health check endpoints (Terminus)",
    "src/migrations/": "Database migration files",
  };

  for (const [dir, purpose] of Object.entries(conditionalDirs)) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[dir] = purpose;
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Core
    { name: "@nestjs/core", pattern: "@nestjs/core", label: "NestJS core framework" },
    { name: "@nestjs/common", pattern: "@nestjs/common", label: "NestJS common utilities and decorators" },
    { name: "@nestjs/platform-express", pattern: "@nestjs/platform-express", label: "Express HTTP adapter (default)" },
    { name: "@nestjs/platform-fastify", pattern: "@nestjs/platform-fastify", label: "Fastify HTTP adapter" },
    // Database
    { name: "@nestjs/typeorm", pattern: "@nestjs/typeorm", label: "TypeORM integration" },
    { name: "@nestjs/mongoose", pattern: "@nestjs/mongoose", label: "Mongoose (MongoDB) integration" },
    { name: "@nestjs/sequelize", pattern: "@nestjs/sequelize", label: "Sequelize integration" },
    { name: "@prisma/client", pattern: "@prisma/client", label: "Prisma ORM client" },
    { name: "@nestjs/mikro-orm", pattern: "@nestjs/mikro-orm", label: "MikroORM integration" },
    // API
    { name: "@nestjs/swagger", pattern: "@nestjs/swagger", label: "Swagger/OpenAPI documentation" },
    { name: "@nestjs/graphql", pattern: "@nestjs/graphql", label: "GraphQL module" },
    { name: "apollo-server-express", pattern: "apollo-server-express", label: "Apollo GraphQL server" },
    // Microservices
    { name: "@nestjs/microservices", pattern: "@nestjs/microservices", label: "Microservices module (TCP, Redis, NATS, etc.)" },
    // Auth
    { name: "@nestjs/passport", pattern: "@nestjs/passport", label: "Passport.js authentication" },
    { name: "@nestjs/jwt", pattern: "@nestjs/jwt", label: "JWT authentication" },
    // Queue
    { name: "@nestjs/bull", pattern: "@nestjs/bull", label: "Bull queue integration" },
    { name: "@nestjs/bullmq", pattern: "@nestjs/bullmq", label: "BullMQ queue integration" },
    // Other
    { name: "@nestjs/config", pattern: "@nestjs/config", label: "Configuration module (@nestjs/config)" },
    { name: "@nestjs/cache-manager", pattern: "@nestjs/cache-manager", label: "Cache manager integration" },
    { name: "@nestjs/terminus", pattern: "@nestjs/terminus", label: "Health checks (Terminus)" },
    { name: "@nestjs/schedule", pattern: "@nestjs/schedule", label: "Task scheduling (cron)" },
    { name: "@nestjs/event-emitter", pattern: "@nestjs/event-emitter", label: "Event emitter integration" },
    { name: "@nestjs/throttler", pattern: "@nestjs/throttler", label: "Rate limiting (Throttler)" },
    { name: "class-validator", pattern: "class-validator", label: "class-validator (DTO validation)" },
    { name: "class-transformer", pattern: "class-transformer", label: "class-transformer (DTO transformation)" },
  ];

  for (const dep of depChecks) {
    if (deps[dep.pattern] || keyDeps[dep.pattern]) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  enrichment.patterns.push({ check: "NestJS detected", label: "Module-based architecture (NestJS)" });
  enrichment.patterns.push({ check: "Dependency injection", label: "Dependency injection via decorators (@Injectable, @Inject)" });

  if (deps["@nestjs/passport"] || deps["@nestjs/jwt"]) {
    enrichment.patterns.push({ check: "Auth guards", label: "Guard-based authentication (Passport/JWT)" });
  }

  if (deps["@nestjs/swagger"]) {
    enrichment.patterns.push({ check: "Swagger", label: "Auto-generated Swagger/OpenAPI documentation" });
  }

  if (deps["@nestjs/graphql"]) {
    enrichment.patterns.push({ check: "GraphQL", label: "GraphQL API (code-first or schema-first)" });
  }

  if (deps["@nestjs/microservices"]) {
    enrichment.patterns.push({ check: "Microservices", label: "Microservices transport layer (TCP, Redis, NATS, gRPC)" });
  }

  if (deps["@nestjs/bull"] || deps["@nestjs/bullmq"]) {
    enrichment.patterns.push({ check: "Bull queues", label: "Background job processing (Bull/BullMQ)" });
  }

  if (deps["class-validator"] && deps["class-transformer"]) {
    enrichment.patterns.push({ check: "class-validator + class-transformer", label: "DTO-based request validation (ValidationPipe)" });
  }

  if (deps["@nestjs/platform-fastify"]) {
    enrichment.patterns.push({ check: "Fastify adapter", label: "Fastify HTTP adapter (instead of Express)" });
  }

  if (deps["@nestjs/schedule"]) {
    enrichment.patterns.push({ check: "Scheduler", label: "Cron-based task scheduling" });
  }

  // ─── Commands ──────────────────────────────────────────────

  enrichment.commands.push(
    { command: "npm run start:dev", description: "Start NestJS in watch mode", category: "dev" },
    { command: "npm run start:debug", description: "Start NestJS in debug mode", category: "dev" },
    { command: "npm run build", description: "Compile TypeScript to JavaScript", category: "build" },
    { command: "npm run start:prod", description: "Start compiled production build", category: "deploy" },
    { command: "npm run test", description: "Run unit tests (Jest)", category: "test" },
    { command: "npm run test:e2e", description: "Run end-to-end tests", category: "test" },
    { command: "npm run test:cov", description: "Run tests with coverage", category: "test" },
    { command: "npm run lint", description: "Run ESLint", category: "lint" },
  );

  // Nest CLI commands
  if (deps["@nestjs/cli"] || existsSync(join(rootDir, "nest-cli.json"))) {
    enrichment.commands.push(
      { command: "nest generate module <name>", description: "Generate a new NestJS module", category: "other" },
      { command: "nest generate controller <name>", description: "Generate a new controller", category: "other" },
      { command: "nest generate service <name>", description: "Generate a new service", category: "other" },
      { command: "nest build", description: "Build the project via Nest CLI", category: "build" },
    );
  }

  // Prisma
  if (deps["@prisma/client"] || deps["prisma"]) {
    enrichment.commands.push(
      { command: "npx prisma migrate dev", description: "Apply pending Prisma migrations", category: "db" },
      { command: "npx prisma generate", description: "Generate Prisma client from schema", category: "db" },
      { command: "npx prisma studio", description: "Open Prisma Studio (DB browser)", category: "db" },
    );
  }

  // TypeORM
  if (deps["typeorm"] || deps["@nestjs/typeorm"]) {
    enrichment.commands.push(
      { command: "npx typeorm migration:run", description: "Run TypeORM migrations", category: "db" },
      { command: "npx typeorm migration:generate -n <name>", description: "Generate TypeORM migration from entity changes", category: "db" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  if (deps["@nestjs/typeorm"] || deps["typeorm"]) {
    enrichment.database = {
      ormName: "TypeORM",
      migrationDir: existsSync(join(rootDir, "src/migrations")) ? "src/migrations" : undefined,
    };
  } else if (deps["@prisma/client"] || deps["prisma"]) {
    enrichment.database = {
      ormName: "Prisma",
      schemaFile: existsSync(join(rootDir, "prisma/schema.prisma")) ? "prisma/schema.prisma" : undefined,
      migrationDir: existsSync(join(rootDir, "prisma/migrations")) ? "prisma/migrations" : undefined,
    };
  } else if (deps["@nestjs/mongoose"]) {
    enrichment.database = { ormName: "Mongoose (MongoDB)" };
  } else if (deps["@nestjs/sequelize"]) {
    enrichment.database = { ormName: "Sequelize" };
  } else if (deps["@nestjs/mikro-orm"]) {
    enrichment.database = { ormName: "MikroORM" };
  }

  // ─── Testing ───────────────────────────────────────────────

  enrichment.testing = {
    framework: "Jest",
    testDir: "src/**/*.spec.ts (colocated) + test/ (e2e)",
    systemTestTools: [],
  };

  if (deps["supertest"] || deps["@nestjs/testing"]) {
    enrichment.testing.systemTestTools!.push("supertest (HTTP integration testing)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T forget the @Injectable() decorator on service classes",
      reason: "NestJS uses decorators for dependency injection metadata. Without @Injectable(), the DI container cannot resolve the class and you'll get a cryptic runtime error",
      severity: "critical",
    },
    {
      rule: "DON'T create circular dependencies between modules",
      reason: "Circular module imports cause 'Cannot resolve dependency' errors. Use forwardRef() as a last resort, but prefer restructuring modules to break the cycle",
      severity: "critical",
    },
    {
      rule: "DON'T modify barrel exports (index.ts) without updating the module's providers/imports",
      reason: "NestJS modules must explicitly register providers and imports. Adding a new service or controller in a barrel export doesn't register it with the DI container",
      severity: "important",
    },
    {
      rule: "ALWAYS use DTOs with class-validator for request validation",
      reason: "Raw request bodies are untyped and unsafe. Define DTO classes with class-validator decorators and enable the global ValidationPipe to enforce validation",
      severity: "important",
    },
    {
      rule: "DON'T inject request-scoped providers into singleton-scoped providers",
      reason: "NestJS defaults to singleton scope. Injecting a REQUEST-scoped provider into a singleton causes unexpected behavior. Use @Inject(SCOPE) or restructure the dependency",
      severity: "important",
    },
    {
      rule: "DON'T bypass the module system by importing services directly",
      reason: "Always import modules, not individual providers. Cross-module access requires the provider's module to export it and the consuming module to import that module",
      severity: "critical",
    },
  );

  return enrichment;
}
