/**
 * Kotlin (Ktor / Spring Kotlin) Deep Analyzer
 *
 * Detects Kotlin-specific patterns, Ktor or Spring Boot with Kotlin,
 * coroutines, Exposed ORM, serialization, and common gotchas.
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

export function analyzeKotlin(
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

  // Read build files
  const buildGradleKts = readSafe(join(rootDir, "build.gradle.kts")) ?? "";
  const buildGradle = readSafe(join(rootDir, "build.gradle")) ?? "";
  const settingsGradleKts = readSafe(join(rootDir, "settings.gradle.kts")) ?? "";
  const settingsGradle = readSafe(join(rootDir, "settings.gradle")) ?? "";
  const allBuildContent = `${buildGradleKts}\n${buildGradle}\n${settingsGradleKts}\n${settingsGradle}`;

  const hasDep = (pattern: string): boolean => {
    return allBuildContent.includes(pattern) || !!keyDeps[pattern];
  };

  // Detect framework
  const isKtor = hasDep("io.ktor") || hasDep("ktor-server");
  const isSpringKotlin = hasDep("org.springframework.boot") || hasDep("spring-boot");

  // Extract Kotlin version
  const kotlinVersionMatch = allBuildContent.match(/kotlin\("jvm"\)\s+version\s+"([^"]+)"/) ??
    allBuildContent.match(/org\.jetbrains\.kotlin[^"]*"([^"]+)"/) ??
    allBuildContent.match(/kotlin_version\s*=\s*["']([^"']+)["']/);
  const kotlinVersion = kotlinVersionMatch?.[1] ?? null;

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "src/main/kotlin/Application.kt",
    "src/main/kotlin/Main.kt",
    "build.gradle.kts",
    "build.gradle",
    "settings.gradle.kts",
    "settings.gradle",
    "gradle.properties",
  ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // Search for Application.kt in nested package directories
  if (existsSync(join(rootDir, "src/main/kotlin"))) {
    try {
      const findAppKt = (dir: string, depth: number): void => {
        if (depth > 4) return;
        const entries = readdirSync(join(rootDir, dir), { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name === "Application.kt") {
            const relative = join(dir, entry.name);
            if (!enrichment.entryPoints.includes(relative)) {
              enrichment.entryPoints.push(relative);
            }
          }
          if (entry.isDirectory()) {
            findAppKt(join(dir, entry.name), depth + 1);
          }
        }
      };
      findAppKt("src/main/kotlin", 0);
    } catch { /* permission denied */ }
  }

  // Ktor-specific entry points
  if (isKtor) {
    const ktorConfigs = ["src/main/resources/application.conf", "src/main/resources/application.yaml"];
    for (const c of ktorConfigs) {
      if (existsSync(join(rootDir, c))) {
        enrichment.entryPoints.push(c);
      }
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "src/main/kotlin/": "Kotlin source files",
    "src/test/kotlin/": "Kotlin test files",
    "src/main/resources/": "Application configuration and static resources",
  };

  if (isKtor) {
    const ktorDirs: Record<string, string> = {
      "src/main/kotlin/routes/": "Ktor route definitions",
      "src/main/kotlin/plugins/": "Ktor plugins (serialization, auth, CORS, etc.)",
      "src/main/kotlin/models/": "Data models and DTOs",
      "src/main/kotlin/services/": "Business logic and service layer",
      "src/main/kotlin/repositories/": "Data access layer",
      "src/main/kotlin/di/": "Dependency injection module definitions (Koin/Kodein)",
    };
    for (const [dir, purpose] of Object.entries(ktorDirs)) {
      if (existsSync(join(rootDir, dir))) {
        enrichment.dirPurposes[dir] = purpose;
      } else {
        enrichment.dirPurposes[dir] = purpose;
      }
    }
  }

  if (isSpringKotlin) {
    const springDirs: Record<string, string> = {
      "src/main/kotlin/controller/": "Spring MVC/WebFlux controllers",
      "src/main/kotlin/controllers/": "Spring MVC/WebFlux controllers",
      "src/main/kotlin/service/": "Spring service layer",
      "src/main/kotlin/services/": "Spring service layer",
      "src/main/kotlin/repository/": "Spring Data repositories",
      "src/main/kotlin/repositories/": "Spring Data repositories",
      "src/main/kotlin/entity/": "JPA entity definitions",
      "src/main/kotlin/entities/": "JPA entity definitions",
      "src/main/kotlin/config/": "Spring configuration classes",
      "src/main/kotlin/dto/": "Data Transfer Objects",
    };
    for (const [dir, purpose] of Object.entries(springDirs)) {
      if (existsSync(join(rootDir, dir))) {
        enrichment.dirPurposes[dir] = purpose;
      }
    }
  }

  const conditionalDirs: Record<string, string> = {
    "src/main/kotlin/domain/": "Domain models and business entities",
    "src/main/kotlin/util/": "Utility functions and extensions",
    "src/main/kotlin/utils/": "Utility functions and extensions",
    "src/main/kotlin/middleware/": "Request/response middleware",
    "src/main/kotlin/auth/": "Authentication and authorization logic",
    "src/main/kotlin/database/": "Database configuration and connection setup",
    "src/main/kotlin/migration/": "Database migration files",
    "src/main/kotlin/migrations/": "Database migration files",
    "buildSrc/": "Gradle build logic and custom plugins",
    "gradle/": "Gradle wrapper and version catalog files",
  };

  for (const [dir, purpose] of Object.entries(conditionalDirs)) {
    if (existsSync(join(rootDir, dir))) {
      enrichment.dirPurposes[dir] = purpose;
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // Ktor
    { name: "ktor-server-core", pattern: "ktor-server-core", label: "Ktor server core" },
    { name: "ktor-server-netty", pattern: "ktor-server-netty", label: "Ktor Netty engine" },
    { name: "ktor-server-cio", pattern: "ktor-server-cio", label: "Ktor CIO engine (coroutine-based)" },
    { name: "ktor-serialization", pattern: "ktor-serialization", label: "Ktor content negotiation/serialization" },
    { name: "ktor-server-auth", pattern: "ktor-server-auth", label: "Ktor authentication plugin" },
    { name: "ktor-server-auth-jwt", pattern: "ktor-server-auth-jwt", label: "Ktor JWT authentication" },
    { name: "ktor-client", pattern: "ktor-client", label: "Ktor HTTP client" },
    // Kotlin standard
    { name: "kotlinx-coroutines", pattern: "kotlinx-coroutines", label: "Kotlin Coroutines (async/concurrency)" },
    { name: "kotlinx-serialization", pattern: "kotlinx-serialization", label: "kotlinx.serialization (multiplatform serialization)" },
    { name: "kotlinx-datetime", pattern: "kotlinx-datetime", label: "kotlinx.datetime (multiplatform date/time)" },
    // Database
    { name: "Exposed", pattern: "exposed", label: "Exposed (Kotlin SQL framework/ORM)" },
    { name: "ktorm", pattern: "ktorm", label: "Ktorm (Kotlin ORM)" },
    { name: "jooq", pattern: "jooq", label: "jOOQ (type-safe SQL)" },
    { name: "hibernate", pattern: "hibernate", label: "Hibernate JPA (ORM)" },
    // DI
    { name: "Koin", pattern: "koin", label: "Koin (lightweight dependency injection)" },
    { name: "Kodein", pattern: "kodein", label: "Kodein (dependency injection)" },
    // Functional
    { name: "Arrow", pattern: "arrow", label: "Arrow (functional programming library)" },
    // Testing
    { name: "kotest", pattern: "kotest", label: "Kotest (Kotlin-native testing framework)" },
    { name: "mockk", pattern: "mockk", label: "MockK (Kotlin mocking library)" },
    { name: "testcontainers", pattern: "testcontainers", label: "Testcontainers (Docker-based integration tests)" },
    // Linting
    { name: "detekt", pattern: "detekt", label: "detekt (static analysis for Kotlin)" },
    { name: "ktlint", pattern: "ktlint", label: "ktlint (Kotlin code formatter/linter)" },
    // Logging
    { name: "logback", pattern: "logback", label: "Logback (logging framework)" },
    { name: "kotlin-logging", pattern: "kotlin-logging", label: "kotlin-logging (idiomatic Kotlin logger)" },
    // Spring-specific
    { name: "spring-boot-starter-web", pattern: "spring-boot-starter-web", label: "Spring Boot Web (MVC)" },
    { name: "spring-boot-starter-webflux", pattern: "spring-boot-starter-webflux", label: "Spring Boot WebFlux (reactive)" },
    { name: "spring-data-jpa", pattern: "spring-data-jpa", label: "Spring Data JPA" },
  ];

  for (const dep of depChecks) {
    if (hasDep(dep.pattern)) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  if (isKtor) {
    enrichment.patterns.push({ check: "Ktor detected", label: `Ktor web framework${kotlinVersion ? ` (Kotlin ${kotlinVersion})` : ""}` });
    enrichment.patterns.push({ check: "Plugin-based architecture", label: "Plugin-based architecture (install plugins in Application module)" });
  }

  if (isSpringKotlin) {
    enrichment.patterns.push({ check: "Spring Boot + Kotlin", label: `Spring Boot with Kotlin${kotlinVersion ? ` (${kotlinVersion})` : ""}` });
  }

  if (hasDep("kotlinx-coroutines")) {
    enrichment.patterns.push({ check: "Coroutines detected", label: "Kotlin Coroutines (structured concurrency)" });
  }

  if (hasDep("kotlinx-serialization")) {
    enrichment.patterns.push({ check: "kotlinx.serialization", label: "kotlinx.serialization (compile-time serialization)" });
  }

  if (hasDep("koin")) {
    enrichment.patterns.push({ check: "Koin detected", label: "Koin dependency injection" });
  }

  if (hasDep("kodein")) {
    enrichment.patterns.push({ check: "Kodein detected", label: "Kodein dependency injection" });
  }

  if (hasDep("arrow")) {
    enrichment.patterns.push({ check: "Arrow detected", label: "Functional programming patterns (Arrow)" });
  }

  if (hasDep("exposed")) {
    enrichment.patterns.push({ check: "Exposed detected", label: "Exposed SQL framework (type-safe queries)" });
  }

  if (hasDep("spring-boot-starter-webflux")) {
    enrichment.patterns.push({ check: "WebFlux detected", label: "Reactive programming (Spring WebFlux + Coroutines)" });
  }

  // ─── Commands ──────────────────────────────────────────────

  const hasGradleWrapper = existsSync(join(rootDir, "gradlew"));
  const gradle = hasGradleWrapper ? "./gradlew" : "gradle";

  enrichment.commands.push(
    { command: `${gradle} run`, description: "Run the application", category: "dev" },
    { command: `${gradle} test`, description: "Run all tests", category: "test" },
    { command: `${gradle} build`, description: "Build the project", category: "build" },
    { command: `${gradle} clean build`, description: "Clean and rebuild", category: "build" },
  );

  if (hasDep("detekt")) {
    enrichment.commands.push(
      { command: `${gradle} detekt`, description: "Run detekt static analysis", category: "lint" },
    );
  }

  if (hasDep("ktlint")) {
    enrichment.commands.push(
      { command: `${gradle} ktlintCheck`, description: "Check code formatting (ktlint)", category: "lint" },
      { command: `${gradle} ktlintFormat`, description: "Auto-format code (ktlint)", category: "lint" },
    );
  }

  if (isKtor) {
    enrichment.commands.push(
      { command: `${gradle} runFatJar`, description: "Build and run fat JAR (Ktor)", category: "deploy" },
      { command: `${gradle} buildFatJar`, description: "Build fat JAR for deployment (Ktor)", category: "build" },
    );
  }

  if (isSpringKotlin) {
    enrichment.commands.push(
      { command: `${gradle} bootRun`, description: "Run Spring Boot application", category: "dev" },
      { command: `${gradle} bootJar`, description: "Build executable Spring Boot JAR", category: "build" },
    );
  }

  // Docker
  if (existsSync(join(rootDir, "docker-compose.yml")) || existsSync(join(rootDir, "compose.yml"))) {
    enrichment.commands.push(
      { command: "docker compose up -d", description: "Start infrastructure services", category: "dev" },
    );
  }

  // Database migrations
  if (hasDep("flyway")) {
    enrichment.commands.push(
      { command: `${gradle} flywayMigrate`, description: "Apply Flyway database migrations", category: "db" },
    );
  }

  if (hasDep("liquibase")) {
    enrichment.commands.push(
      { command: `${gradle} update`, description: "Apply Liquibase database migrations", category: "db" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  if (hasDep("exposed")) {
    enrichment.database = {
      ormName: "Exposed",
      migrationDir: existsSync(join(rootDir, "src/main/resources/db/migration")) ? "src/main/resources/db/migration" : undefined,
    };
  } else if (hasDep("hibernate") || hasDep("spring-data-jpa")) {
    enrichment.database = {
      ormName: "Hibernate JPA",
      migrationDir: existsSync(join(rootDir, "src/main/resources/db/migration")) ? "src/main/resources/db/migration" : undefined,
    };
  } else if (hasDep("ktorm")) {
    enrichment.database = { ormName: "Ktorm" };
  } else if (hasDep("jooq")) {
    enrichment.database = { ormName: "jOOQ" };
  }

  // ─── Testing ───────────────────────────────────────────────

  const testFramework = hasDep("kotest") ? "Kotest" : "JUnit 5";

  enrichment.testing = {
    framework: testFramework,
    testDir: "src/test/kotlin/",
    systemTestTools: [],
  };

  if (hasDep("mockk")) {
    enrichment.testing.systemTestTools!.push("MockK (Kotlin-idiomatic mocking)");
  }
  if (hasDep("testcontainers")) {
    enrichment.testing.systemTestTools!.push("Testcontainers (Docker-based integration tests)");
  }
  if (isKtor) {
    enrichment.testing.systemTestTools!.push("Ktor testApplication (in-process server testing)");
  }
  if (isSpringKotlin) {
    enrichment.testing.systemTestTools!.push("Spring Boot Test (integration testing)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T use GlobalScope for launching coroutines",
      reason: "GlobalScope coroutines are not bound to any lifecycle and cannot be cancelled. They leak resources and run until completion or process exit. Use a scoped CoroutineScope (e.g., viewModelScope, lifecycleScope, or a custom scope)",
      severity: "critical",
    },
    {
      rule: "DON'T block the IO dispatcher with CPU-intensive work",
      reason: "Dispatchers.IO is optimized for blocking I/O (file, network). CPU-intensive work should use Dispatchers.Default to avoid starving I/O threads. Use withContext(Dispatchers.Default) for computation",
      severity: "important",
    },
    {
      rule: "DON'T forget the suspend modifier on async functions",
      reason: "Functions that call other suspend functions or coroutine builders must be marked suspend. Missing it causes compiler errors or forces you to use runBlocking which defeats the purpose of coroutines",
      severity: "important",
    },
    {
      rule: "DON'T mix Java and Kotlin null handling carelessly",
      reason: "Java types are platform types in Kotlin (unknown nullability). A Java method returning null assigned to a non-null Kotlin type causes a NullPointerException at runtime. Always add null checks at Java/Kotlin boundaries",
      severity: "critical",
    },
    {
      rule: "ALWAYS use structured concurrency",
      reason: "Launch coroutines within a structured scope (coroutineScope, supervisorScope) so that child failures propagate correctly and cancellation is handled. Unstructured coroutines are hard to debug and leak resources",
      severity: "important",
    },
    {
      rule: "DON'T use the !! (non-null assertion) operator in production code",
      reason: "The !! operator throws a KotlinNullPointerException if the value is null. Use safe calls (?.), elvis operator (?:), or require()/checkNotNull() with descriptive messages instead",
      severity: "important",
    },
    {
      rule: "DON'T use data classes for JPA entities",
      reason: "data class auto-generated equals/hashCode/toString can cause issues with lazy-loaded proxies, circular references, and entity identity. Use regular classes with manual equals/hashCode based on the entity ID",
      severity: "important",
    },
    {
      rule: "DON'T forget to configure kotlinx.serialization plugin in build.gradle.kts",
      reason: "kotlinx.serialization requires both the Gradle plugin (kotlin(\"plugin.serialization\")) and the runtime library. Missing the plugin causes @Serializable annotation to have no effect",
      severity: "important",
    },
  );

  return enrichment;
}
