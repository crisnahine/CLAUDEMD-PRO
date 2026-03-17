/**
 * .NET / ASP.NET Core Deep Analyzer
 *
 * Detects ASP.NET Core patterns, Entity Framework Core, Identity,
 * SignalR, Blazor, MediatR, and common C#/.NET gotchas.
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

function findCsprojFiles(rootDir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".csproj")) {
        results.push(join(rootDir, entry.name));
      }
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "bin" && entry.name !== "obj") {
        const subDir = join(rootDir, entry.name);
        try {
          const subEntries = readdirSync(subDir, { withFileTypes: true });
          for (const sub of subEntries) {
            if (sub.isFile() && sub.name.endsWith(".csproj")) {
              results.push(join(subDir, sub.name));
            }
          }
        } catch { /* permission denied */ }
      }
    }
  } catch { /* permission denied */ }
  return results;
}

// ─── Analyzer ───────────────────────────────────────────────

export function analyzeDotnet(
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

  // Read .csproj files and extract PackageReference names
  const csprojFiles = findCsprojFiles(rootDir);
  const allPackageRefs: Set<string> = new Set();
  for (const csproj of csprojFiles) {
    const content = readSafe(csproj);
    if (content) {
      const matches = content.matchAll(/PackageReference\s+Include="([^"]+)"/g);
      for (const m of matches) {
        allPackageRefs.add(m[1]);
      }
    }
  }

  const hasPackage = (name: string): boolean => {
    return allPackageRefs.has(name) || !!keyDeps[name];
  };

  // Read solution file if present
  const slnFiles = (() => {
    try {
      return readdirSync(rootDir).filter((f) => f.endsWith(".sln"));
    } catch {
      return [];
    }
  })();

  // Detect frameworks
  const isAspNetCore = hasPackage("Microsoft.AspNetCore.App") ||
    allPackageRefs.has("Microsoft.NET.Sdk.Web") ||
    csprojFiles.some((f) => {
      const content = readSafe(f);
      return content?.includes("Microsoft.NET.Sdk.Web") ?? false;
    });
  const hasEfCore = hasPackage("Microsoft.EntityFrameworkCore") || hasPackage("Microsoft.EntityFrameworkCore.SqlServer") || hasPackage("Microsoft.EntityFrameworkCore.Design");
  const hasIdentity = hasPackage("Microsoft.AspNetCore.Identity.EntityFrameworkCore") || hasPackage("Microsoft.AspNetCore.Identity");
  const hasSignalR = hasPackage("Microsoft.AspNetCore.SignalR");
  const hasBlazor = csprojFiles.some((f) => {
    const content = readSafe(f);
    return content?.includes("Microsoft.NET.Sdk.BlazorWebAssembly") ?? false;
  }) || hasPackage("Microsoft.AspNetCore.Components.WebAssembly");

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "Program.cs",
    "Startup.cs",
    "appsettings.json",
    "appsettings.Development.json",
  ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // Add .csproj files as entry points
  for (const csproj of csprojFiles) {
    const relative = csproj.replace(rootDir + "/", "");
    enrichment.entryPoints.push(relative);
  }

  // Add .sln files as entry points
  for (const sln of slnFiles) {
    enrichment.entryPoints.push(sln);
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "Controllers/": "API/MVC controller classes (HTTP endpoint handlers)",
    "Services/": "Business logic and service layer classes",
    "Models/": "Data models, view models, and domain entities",
    "Data/": "Database context, entity configurations, and data access",
    "Migrations/": "Entity Framework Core database migration files",
    "Views/": "Razor view templates (MVC)",
    "Pages/": "Razor Pages (page-based routing)",
    "wwwroot/": "Static files served directly (CSS, JS, images)",
    "Properties/": "Project properties and launchSettings.json",
  };

  const conditionalDirs: Record<string, string> = {
    "DTOs/": "Data Transfer Objects for API requests/responses",
    "Dtos/": "Data Transfer Objects for API requests/responses",
    "Interfaces/": "Service and repository interface definitions",
    "Repositories/": "Data access layer (Repository pattern)",
    "Middleware/": "Custom ASP.NET middleware components",
    "Filters/": "Action/exception filters for cross-cutting concerns",
    "Extensions/": "Extension methods for service registration and configuration",
    "Hubs/": "SignalR hub classes for real-time communication",
    "Configuration/": "Configuration classes and option bindings",
    "Validators/": "FluentValidation validator classes",
    "Mappings/": "AutoMapper mapping profiles",
    "Entities/": "Database entity/domain model definitions",
    "Infrastructure/": "Infrastructure layer (persistence, external services)",
    "Application/": "Application layer (CQRS commands, queries, handlers)",
    "Domain/": "Domain layer (entities, value objects, domain events)",
    "Endpoints/": "Minimal API endpoint definitions",
    "Features/": "Feature-sliced directory structure (vertical slices)",
    "BackgroundServices/": "Hosted services and background workers",
    "Tests/": "Unit and integration test projects",
  };

  for (const [dir, purpose] of Object.entries(conditionalDirs)) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[dir] = purpose;
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Core framework
    { name: "Microsoft.EntityFrameworkCore", pattern: "Microsoft.EntityFrameworkCore", label: "Entity Framework Core (ORM)" },
    { name: "Microsoft.EntityFrameworkCore.SqlServer", pattern: "Microsoft.EntityFrameworkCore.SqlServer", label: "EF Core SQL Server provider" },
    { name: "Microsoft.EntityFrameworkCore.Design", pattern: "Microsoft.EntityFrameworkCore.Design", label: "EF Core design-time tools (migrations)" },
    { name: "Npgsql.EntityFrameworkCore.PostgreSQL", pattern: "Npgsql.EntityFrameworkCore.PostgreSQL", label: "EF Core PostgreSQL provider (Npgsql)" },
    { name: "Microsoft.AspNetCore.Identity.EntityFrameworkCore", pattern: "Microsoft.AspNetCore.Identity.EntityFrameworkCore", label: "ASP.NET Core Identity (auth + user management)" },
    // Mapping & validation
    { name: "AutoMapper", pattern: "AutoMapper", label: "AutoMapper (object-to-object mapping)" },
    { name: "AutoMapper.Extensions.Microsoft.DependencyInjection", pattern: "AutoMapper.Extensions.Microsoft.DependencyInjection", label: "AutoMapper DI integration" },
    { name: "FluentValidation", pattern: "FluentValidation", label: "FluentValidation (model validation)" },
    { name: "FluentValidation.AspNetCore", pattern: "FluentValidation.AspNetCore", label: "FluentValidation ASP.NET Core integration" },
    // CQRS & Mediator
    { name: "MediatR", pattern: "MediatR", label: "MediatR (mediator/CQRS pattern)" },
    // Logging
    { name: "Serilog", pattern: "Serilog", label: "Serilog (structured logging)" },
    { name: "Serilog.AspNetCore", pattern: "Serilog.AspNetCore", label: "Serilog ASP.NET Core integration" },
    { name: "NLog", pattern: "NLog", label: "NLog (logging framework)" },
    // API documentation
    { name: "Swashbuckle.AspNetCore", pattern: "Swashbuckle.AspNetCore", label: "Swashbuckle (Swagger/OpenAPI)" },
    { name: "NSwag.AspNetCore", pattern: "NSwag.AspNetCore", label: "NSwag (OpenAPI toolchain)" },
    // Real-time
    { name: "Microsoft.AspNetCore.SignalR", pattern: "Microsoft.AspNetCore.SignalR", label: "SignalR (real-time communication)" },
    // Blazor
    { name: "Microsoft.AspNetCore.Components.WebAssembly", pattern: "Microsoft.AspNetCore.Components.WebAssembly", label: "Blazor WebAssembly" },
    // Background jobs
    { name: "Hangfire", pattern: "Hangfire", label: "Hangfire (background job processing)" },
    { name: "Hangfire.Core", pattern: "Hangfire.Core", label: "Hangfire core library" },
    // Messaging
    { name: "MassTransit", pattern: "MassTransit", label: "MassTransit (message bus / service bus)" },
    // Resilience
    { name: "Polly", pattern: "Polly", label: "Polly (resilience and transient fault handling)" },
    { name: "Microsoft.Extensions.Http.Polly", pattern: "Microsoft.Extensions.Http.Polly", label: "Polly HttpClient integration" },
    // Health checks
    { name: "AspNetCore.HealthChecks.UI", pattern: "AspNetCore.HealthChecks.UI", label: "Health Checks UI" },
    { name: "Microsoft.Extensions.Diagnostics.HealthChecks", pattern: "Microsoft.Extensions.Diagnostics.HealthChecks", label: "Health checks" },
    // Data access
    { name: "Dapper", pattern: "Dapper", label: "Dapper (micro-ORM)" },
    // Testing
    { name: "xunit", pattern: "xunit", label: "xUnit (testing framework)" },
    { name: "NUnit", pattern: "NUnit", label: "NUnit (testing framework)" },
    { name: "MSTest.TestFramework", pattern: "MSTest.TestFramework", label: "MSTest (testing framework)" },
    { name: "Moq", pattern: "Moq", label: "Moq (mocking library)" },
    { name: "NSubstitute", pattern: "NSubstitute", label: "NSubstitute (mocking library)" },
    { name: "FluentAssertions", pattern: "FluentAssertions", label: "FluentAssertions (test assertions)" },
    // Caching
    { name: "Microsoft.Extensions.Caching.StackExchangeRedis", pattern: "Microsoft.Extensions.Caching.StackExchangeRedis", label: "Redis distributed caching" },
  ];

  for (const dep of depChecks) {
    if (hasPackage(dep.pattern)) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  if (isAspNetCore) {
    enrichment.patterns.push({ check: "ASP.NET Core detected", label: "ASP.NET Core web application" });
  }

  if (hasEfCore) {
    enrichment.patterns.push({ check: "EF Core detected", label: "Entity Framework Core (code-first ORM)" });
  }

  if (hasIdentity) {
    enrichment.patterns.push({ check: "Identity detected", label: "ASP.NET Core Identity (authentication + authorization)" });
  }

  if (hasSignalR) {
    enrichment.patterns.push({ check: "SignalR detected", label: "SignalR real-time communication (WebSockets)" });
  }

  if (hasBlazor) {
    enrichment.patterns.push({ check: "Blazor detected", label: "Blazor WebAssembly (C# in the browser)" });
  }

  if (hasPackage("MediatR")) {
    enrichment.patterns.push({ check: "MediatR detected", label: "CQRS/Mediator pattern (MediatR)" });
  }

  if (existsSync(join(rootDir, "Application")) && existsSync(join(rootDir, "Domain")) && existsSync(join(rootDir, "Infrastructure"))) {
    enrichment.patterns.push({ check: "Clean architecture dirs", label: "Clean Architecture (Domain/Application/Infrastructure layers)" });
  }

  if (hasPackage("FluentValidation")) {
    enrichment.patterns.push({ check: "FluentValidation detected", label: "FluentValidation request validation" });
  }

  if (hasPackage("AutoMapper")) {
    enrichment.patterns.push({ check: "AutoMapper detected", label: "AutoMapper object mapping" });
  }

  if (slnFiles.length > 0) {
    enrichment.patterns.push({ check: "Solution file found", label: "Multi-project solution (.sln)" });
  }

  // Check for Minimal API pattern
  const programCs = readSafe(join(rootDir, "Program.cs"));
  if (programCs && (programCs.includes("app.MapGet") || programCs.includes("app.MapPost"))) {
    enrichment.patterns.push({ check: "Minimal APIs", label: "Minimal API endpoints (no controllers)" });
  }

  if (hasPackage("Polly")) {
    enrichment.patterns.push({ check: "Polly detected", label: "Resilience patterns (retry, circuit breaker via Polly)" });
  }

  if (hasPackage("MassTransit")) {
    enrichment.patterns.push({ check: "MassTransit detected", label: "Message-based communication (MassTransit)" });
  }

  // ─── Commands ──────────────────────────────────────────────

  enrichment.commands.push(
    { command: "dotnet run", description: "Run the application", category: "dev" },
    { command: "dotnet watch", description: "Run with hot reload (file watcher)", category: "dev" },
    { command: "dotnet build", description: "Build the solution/project", category: "build" },
    { command: "dotnet test", description: "Run all tests", category: "test" },
    { command: "dotnet test --collect:\"XPlat Code Coverage\"", description: "Run tests with code coverage", category: "test" },
    { command: "dotnet publish -c Release", description: "Publish for production deployment", category: "deploy" },
  );

  if (hasEfCore) {
    enrichment.commands.push(
      { command: "dotnet ef migrations add <Name>", description: "Create a new EF Core migration", category: "db" },
      { command: "dotnet ef database update", description: "Apply pending EF Core migrations", category: "db" },
      { command: "dotnet ef migrations list", description: "List all EF Core migrations", category: "db" },
      { command: "dotnet ef database drop", description: "Drop the database", category: "db" },
    );
  }

  if (hasPackage("Dapper")) {
    enrichment.commands.push(
      { command: "dotnet run -- migrate", description: "Run database migrations (if using custom runner)", category: "db" },
    );
  }

  // Format/lint
  enrichment.commands.push(
    { command: "dotnet format", description: "Format code (built-in formatter)", category: "lint" },
  );

  // Docker
  if (existsSync(join(rootDir, "Dockerfile")) || existsSync(join(rootDir, "docker-compose.yml"))) {
    enrichment.commands.push(
      { command: "docker compose up -d", description: "Start infrastructure services (DB, Redis, etc.)", category: "dev" },
    );
  }

  // Restore
  enrichment.commands.push(
    { command: "dotnet restore", description: "Restore NuGet packages", category: "build" },
  );

  // ─── Database ──────────────────────────────────────────────

  if (hasEfCore) {
    enrichment.database = {
      ormName: "Entity Framework Core",
      migrationDir: existsSync(join(rootDir, "Migrations")) ? "Migrations" : existsSync(join(rootDir, "Data/Migrations")) ? "Data/Migrations" : undefined,
    };
  } else if (hasPackage("Dapper")) {
    enrichment.database = {
      ormName: "Dapper (micro-ORM)",
    };
  }

  // ─── Testing ───────────────────────────────────────────────

  const testFramework = hasPackage("xunit") ? "xUnit" : hasPackage("NUnit") ? "NUnit" : hasPackage("MSTest.TestFramework") ? "MSTest" : "xUnit (recommended)";

  enrichment.testing = {
    framework: testFramework,
    testDir: "Tests/ or *.Tests/ project",
    systemTestTools: [],
  };

  if (hasPackage("Moq")) {
    enrichment.testing.systemTestTools!.push("Moq (mocking)");
  }
  if (hasPackage("NSubstitute")) {
    enrichment.testing.systemTestTools!.push("NSubstitute (mocking)");
  }
  if (hasPackage("FluentAssertions")) {
    enrichment.testing.systemTestTools!.push("FluentAssertions (readable assertions)");
  }
  if (hasPackage("Microsoft.AspNetCore.Mvc.Testing")) {
    enrichment.testing.systemTestTools!.push("WebApplicationFactory (integration testing)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T modify EF Core Migrations after they have been applied to a database",
      reason: "Applied migrations are recorded in the __EFMigrationsHistory table. Modifying them causes schema drift. Create a new migration to make changes",
      severity: "critical",
    },
    {
      rule: "DON'T use synchronous I/O in controllers or middleware",
      reason: "Synchronous calls (e.g., .Result, .Wait()) on async methods block the thread pool and can cause deadlocks. Always use async/await throughout the call chain",
      severity: "critical",
    },
    {
      rule: "DON'T expose Entity Framework entities directly in API responses",
      reason: "Returning EF entities leaks database schema details, navigation properties, and can cause circular serialization. Use DTOs or view models for API responses",
      severity: "important",
    },
    {
      rule: "DON'T forget to register services in the DI container",
      reason: "ASP.NET Core uses constructor injection. Services must be registered in Program.cs (or Startup.cs) with AddScoped, AddTransient, or AddSingleton, or they will fail to resolve at runtime",
      severity: "critical",
    },
    {
      rule: "DON'T store secrets in appsettings.json",
      reason: "appsettings.json is committed to source control. Use User Secrets (development), environment variables, or Azure Key Vault / AWS Secrets Manager for sensitive configuration",
      severity: "critical",
    },
    {
      rule: "ALWAYS use DTOs for API request and response models",
      reason: "DTOs decouple the API contract from internal domain models. This prevents over-posting attacks, controls serialization, and allows independent evolution of API and domain",
      severity: "important",
    },
    {
      rule: "ALWAYS use the correct DI lifetime (AddScoped, AddTransient, AddSingleton)",
      reason: "Using AddSingleton for DbContext causes concurrency issues. Using AddTransient for expensive services wastes resources. AddScoped is correct for per-request services like DbContext",
      severity: "critical",
    },
    {
      rule: "DON'T disable HTTPS redirection in production",
      reason: "UseHttpsRedirection and HSTS are security defaults. Disabling them exposes the application to man-in-the-middle attacks. Only skip HTTPS in local development behind a reverse proxy",
      severity: "important",
    },
    {
      rule: "DON'T catch exceptions broadly in controllers — use exception middleware",
      reason: "Individual try/catch in every controller is repetitive and error-prone. Use UseExceptionHandler or a custom exception-handling middleware for consistent error responses",
      severity: "important",
    },
    {
      rule: "DON'T use async void — always use async Task",
      reason: "async void methods cannot be awaited and swallow exceptions silently. The only valid use is event handlers. Always return Task or Task<T> from async methods",
      severity: "critical",
    },
  );

  return enrichment;
}
