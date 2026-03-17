/**
 * Spring Boot Deep Analyzer
 *
 * Detects Spring Boot annotations, JPA/Hibernate, security config,
 * controller/service/repository layers, Maven/Gradle build tools,
 * Flyway/Liquibase migrations, profiles, and actuator endpoints.
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

type BuildTool = "maven" | "gradle" | "unknown";

function detectBuildTool(rootDir: string): BuildTool {
  if (existsSync(join(rootDir, "pom.xml"))) return "maven";
  if (existsSync(join(rootDir, "build.gradle")) || existsSync(join(rootDir, "build.gradle.kts"))) return "gradle";
  return "unknown";
}

function findPropertiesOrYaml(rootDir: string): { path: string; content: string } | null {
  // Spring Boot supports application.yml, application.yaml, application.properties
  const candidates = [
    "src/main/resources/application.yml",
    "src/main/resources/application.yaml",
    "src/main/resources/application.properties",
  ];
  for (const c of candidates) {
    const content = readSafe(join(rootDir, c));
    if (content) return { path: c, content };
  }
  return null;
}

function findMainClass(rootDir: string): string | null {
  // Look for @SpringBootApplication in src/main/java
  const javaDir = join(rootDir, "src/main/java");
  const kotlinDir = join(rootDir, "src/main/kotlin");
  const searchDir = existsSync(javaDir) ? javaDir : existsSync(kotlinDir) ? kotlinDir : null;
  if (!searchDir) return null;

  // Recursively search (max 4 levels deep) for the main class
  return findAnnotatedFile(searchDir, "@SpringBootApplication", 4);
}

function findAnnotatedFile(dir: string, annotation: string, maxDepth: number, depth = 0): string | null {
  if (depth >= maxDepth) return null;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith(".java") || entry.name.endsWith(".kt"))) {
        const content = readSafe(join(dir, entry.name));
        if (content?.includes(annotation)) {
          return join(dir, entry.name);
        }
      } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const found = findAnnotatedFile(join(dir, entry.name), annotation, maxDepth, depth + 1);
        if (found) return found;
      }
    }
  } catch { /* permission denied */ }
  return null;
}

// ─── Analyzer ───────────────────────────────────────────────

export function analyzeSpring(
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

  const buildTool = detectBuildTool(rootDir);
  const appConfig = findPropertiesOrYaml(rootDir);
  const isKotlin = existsSync(join(rootDir, "src/main/kotlin"));
  const lang = isKotlin ? "kotlin" : "java";
  const ext = isKotlin ? ".kt" : ".java";

  // Read build file for dependency analysis
  const pomXml = readSafe(join(rootDir, "pom.xml")) ?? "";
  const buildGradle = readSafe(join(rootDir, "build.gradle")) ?? "";
  const buildGradleKts = readSafe(join(rootDir, "build.gradle.kts")) ?? "";
  const buildFile = pomXml || buildGradle || buildGradleKts;

  // ─── Entry Points ──────────────────────────────────────────

  const mainClass = findMainClass(rootDir);
  if (mainClass) {
    // Convert absolute path to relative
    const relative = mainClass.replace(rootDir + "/", "");
    enrichment.entryPoints.push(relative);
  }

  if (appConfig) {
    enrichment.entryPoints.push(appConfig.path);
  }

  if (buildTool === "maven" && existsSync(join(rootDir, "pom.xml"))) {
    enrichment.entryPoints.push("pom.xml");
  }
  if (buildTool === "gradle") {
    if (existsSync(join(rootDir, "build.gradle.kts"))) enrichment.entryPoints.push("build.gradle.kts");
    else if (existsSync(join(rootDir, "build.gradle"))) enrichment.entryPoints.push("build.gradle");
    if (existsSync(join(rootDir, "settings.gradle.kts"))) enrichment.entryPoints.push("settings.gradle.kts");
    else if (existsSync(join(rootDir, "settings.gradle"))) enrichment.entryPoints.push("settings.gradle");
  }

  // ─── Directory Purposes ────────────────────────────────────

  const srcLang = isKotlin ? "src/main/kotlin" : "src/main/java";
  const testLang = isKotlin ? "src/test/kotlin" : "src/test/java";

  enrichment.dirPurposes = {
    [`${srcLang}/`]: `Application source (${lang})`,
    [`${testLang}/`]: `Test source (${lang})`,
    "src/main/resources/": "Application config, templates, static assets",
    "src/main/resources/static/": "Static web assets (served directly)",
    "src/main/resources/templates/": "Thymeleaf/Freemarker templates",
    "src/test/resources/": "Test configuration + fixtures",
  };

  // Detect common package structure patterns
  const srcBase = join(rootDir, srcLang);
  if (existsSync(srcBase)) {
    // Walk into the package structure (e.g. com/example/app)
    const detectPackageDirs = (dir: string, depth: number, prefix: string): void => {
      if (depth > 5) return;
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        const dirs = entries.filter((e) => e.isDirectory());
        const files = entries.filter((e) => e.isFile());

        // If we find typical Spring package names, map them
        for (const d of dirs) {
          const dirName = d.name.toLowerCase();
          const fullPrefix = prefix ? `${prefix}/${d.name}` : d.name;

          const purposes: Record<string, string> = {
            controller: "REST controllers (@RestController)",
            controllers: "REST controllers (@RestController)",
            rest: "REST API endpoints",
            api: "API layer",
            service: "Service layer (business logic)",
            services: "Service layer (business logic)",
            repository: "Data access layer (JPA repositories)",
            repositories: "Data access layer (JPA repositories)",
            model: "JPA entity classes (@Entity)",
            models: "JPA entity classes (@Entity)",
            entity: "JPA entity classes (@Entity)",
            entities: "JPA entity classes (@Entity)",
            domain: "Domain model classes",
            dto: "Data Transfer Objects",
            dtos: "Data Transfer Objects",
            config: "Spring @Configuration classes",
            configuration: "Spring @Configuration classes",
            security: "Spring Security configuration",
            exception: "Exception handlers (@ControllerAdvice)",
            exceptions: "Exception handlers (@ControllerAdvice)",
            handler: "Exception / event handlers",
            mapper: "Object mappers (MapStruct/ModelMapper)",
            mappers: "Object mappers (MapStruct/ModelMapper)",
            util: "Utility classes",
            utils: "Utility classes",
            common: "Shared code across modules",
            event: "Domain events",
            events: "Domain events",
            listener: "Event listeners",
            listeners: "Event listeners",
            filter: "Servlet/HTTP filters",
            interceptor: "Spring interceptors",
            aop: "Aspect-oriented programming aspects",
            scheduler: "Scheduled tasks (@Scheduled)",
            job: "Batch/scheduled jobs",
            jobs: "Batch/scheduled jobs",
            messaging: "Message consumers/producers (Kafka/RabbitMQ)",
            client: "HTTP/REST clients (Feign/WebClient)",
          };

          if (purposes[dirName]) {
            enrichment.dirPurposes[`${srcLang}/*/${fullPrefix}/`] = purposes[dirName];
          }

          // Recurse one more level for package-organized projects
          if (files.length === 0 && dirs.length <= 3) {
            detectPackageDirs(join(dir, d.name), depth + 1, fullPrefix);
          }
        }
      } catch { /* permission denied */ }
    };

    detectPackageDirs(srcBase, 0, "");
  }

  // Migration dirs
  if (existsSync(join(rootDir, "src/main/resources/db/migration"))) {
    enrichment.dirPurposes["src/main/resources/db/migration/"] = "Flyway migration scripts (V1__name.sql)";
  }
  if (existsSync(join(rootDir, "src/main/resources/db/changelog"))) {
    enrichment.dirPurposes["src/main/resources/db/changelog/"] = "Liquibase changelog files";
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    { name: "spring-boot-starter-web", pattern: "starter-web", label: "Spring Web (REST API)" },
    { name: "spring-boot-starter-data-jpa", pattern: "starter-data-jpa", label: "Spring Data JPA (Hibernate)" },
    { name: "spring-boot-starter-security", pattern: "starter-security", label: "Spring Security" },
    { name: "spring-boot-starter-actuator", pattern: "starter-actuator", label: "Actuator (health/metrics endpoints)" },
    { name: "spring-boot-starter-webflux", pattern: "webflux", label: "WebFlux (reactive/non-blocking)" },
    { name: "spring-boot-starter-websocket", pattern: "websocket", label: "WebSocket support" },
    { name: "spring-boot-starter-cache", pattern: "starter-cache", label: "Spring Cache abstraction" },
    { name: "spring-boot-starter-validation", pattern: "starter-validation", label: "Bean Validation (jakarta.validation)" },
    { name: "spring-boot-starter-mail", pattern: "starter-mail", label: "Email support" },
    { name: "spring-boot-starter-amqp", pattern: "starter-amqp", label: "RabbitMQ (AMQP messaging)" },
    { name: "spring-cloud-starter", pattern: "spring-cloud", label: "Spring Cloud (microservices)" },
    { name: "spring-kafka", pattern: "spring-kafka", label: "Apache Kafka integration" },
    { name: "flyway", pattern: "flyway", label: "Flyway (DB migrations)" },
    { name: "liquibase", pattern: "liquibase", label: "Liquibase (DB migrations)" },
    { name: "lombok", pattern: "lombok", label: "Lombok (boilerplate reduction)" },
    { name: "mapstruct", pattern: "mapstruct", label: "MapStruct (object mapping)" },
    { name: "springdoc-openapi", pattern: "springdoc", label: "SpringDoc OpenAPI (Swagger)" },
    { name: "swagger", pattern: "swagger", label: "Swagger/OpenAPI documentation" },
    { name: "querydsl", pattern: "querydsl", label: "QueryDSL (type-safe queries)" },
    { name: "testcontainers", pattern: "testcontainers", label: "Testcontainers (Docker-based tests)" },
    { name: "spring-boot-starter-batch", pattern: "starter-batch", label: "Spring Batch (batch processing)" },
    { name: "spring-boot-starter-oauth2", pattern: "oauth2", label: "OAuth2 authentication" },
    { name: "spring-boot-starter-graphql", pattern: "graphql", label: "Spring GraphQL" },
    { name: "redis", pattern: "redis", label: "Redis (cache / session store)" },
    { name: "spring-boot-devtools", pattern: "devtools", label: "Spring DevTools (hot reload)" },
    { name: "h2", pattern: "h2database", label: "H2 (in-memory DB for tests)" },
  ];

  for (const dep of depChecks) {
    if (buildFile.includes(dep.pattern) || buildFile.includes(dep.name)) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  if (buildFile.includes("starter-data-jpa") || buildFile.includes("hibernate")) {
    enrichment.patterns.push({ check: "JPA/Hibernate in deps", label: "JPA/Hibernate ORM with repository pattern" });
  }

  if (buildFile.includes("starter-security") || buildFile.includes("spring-security")) {
    enrichment.patterns.push({ check: "Spring Security in deps", label: "Spring Security (auth + CSRF)" });
  }

  if (buildFile.includes("webflux")) {
    enrichment.patterns.push({ check: "WebFlux in deps", label: "Reactive / non-blocking (WebFlux + Project Reactor)" });
  }

  if (buildFile.includes("flyway")) {
    enrichment.patterns.push({ check: "Flyway in deps", label: "Flyway versioned SQL migrations" });
  }

  if (buildFile.includes("liquibase")) {
    enrichment.patterns.push({ check: "Liquibase in deps", label: "Liquibase changelog migrations" });
  }

  if (buildFile.includes("spring-cloud")) {
    enrichment.patterns.push({ check: "Spring Cloud in deps", label: "Microservices architecture (Spring Cloud)" });
  }

  if (buildFile.includes("spring-kafka") || buildFile.includes("kafka")) {
    enrichment.patterns.push({ check: "Kafka in deps", label: "Event-driven messaging (Kafka)" });
  }

  if (buildFile.includes("starter-amqp") || buildFile.includes("rabbitmq")) {
    enrichment.patterns.push({ check: "RabbitMQ in deps", label: "Message queue (RabbitMQ)" });
  }

  if (buildFile.includes("testcontainers")) {
    enrichment.patterns.push({ check: "Testcontainers in deps", label: "Docker-based integration testing" });
  }

  if (buildFile.includes("mapstruct")) {
    enrichment.patterns.push({ check: "MapStruct in deps", label: "Compile-time object mapping (MapStruct)" });
  }

  if (buildFile.includes("lombok")) {
    enrichment.patterns.push({ check: "Lombok in deps", label: "Lombok annotations (@Data, @Builder, etc.)" });
  }

  if (buildFile.includes("springdoc") || buildFile.includes("swagger")) {
    enrichment.patterns.push({ check: "OpenAPI docs in deps", label: "OpenAPI/Swagger API documentation" });
  }

  // Application config patterns
  if (appConfig) {
    const config = appConfig.content;
    if (config.includes("spring.profiles")) {
      enrichment.patterns.push({ check: "spring.profiles in config", label: "Spring profiles (dev/staging/prod)" });
    }
    if (config.includes("actuator") || config.includes("management.endpoints")) {
      enrichment.patterns.push({ check: "actuator config", label: "Actuator health/metrics endpoints" });
    }
    if (config.includes("spring.cache")) {
      enrichment.patterns.push({ check: "spring.cache config", label: "Application-level caching" });
    }
  }

  // Check for multi-module project
  if (existsSync(join(rootDir, "settings.gradle")) || existsSync(join(rootDir, "settings.gradle.kts"))) {
    const settingsGradle = readSafe(join(rootDir, "settings.gradle")) ??
      readSafe(join(rootDir, "settings.gradle.kts")) ?? "";
    if (settingsGradle.includes("include")) {
      enrichment.patterns.push({ check: "multi-module build", label: "Multi-module Gradle project" });
    }
  }
  if (pomXml.includes("<modules>")) {
    enrichment.patterns.push({ check: "multi-module Maven", label: "Multi-module Maven project" });
  }

  // ─── Commands ──────────────────────────────────────────────

  const hasWrapper = buildTool === "gradle"
    ? existsSync(join(rootDir, "gradlew"))
    : existsSync(join(rootDir, "mvnw"));

  if (buildTool === "gradle") {
    const gradle = hasWrapper ? "./gradlew" : "gradle";
    enrichment.commands.push(
      { command: `${gradle} bootRun`, description: "Start Spring Boot dev server", category: "dev" },
      { command: `${gradle} test`, description: "Run test suite", category: "test" },
      { command: `${gradle} build`, description: "Build JAR/WAR artifact", category: "build" },
      { command: `${gradle} clean build`, description: "Clean and rebuild from scratch", category: "build" },
      { command: `${gradle} bootJar`, description: "Build executable JAR", category: "build" },
      { command: `${gradle} dependencies`, description: "List project dependencies", category: "other" },
    );
  } else if (buildTool === "maven") {
    const mvn = hasWrapper ? "./mvnw" : "mvn";
    enrichment.commands.push(
      { command: `${mvn} spring-boot:run`, description: "Start Spring Boot dev server", category: "dev" },
      { command: `${mvn} test`, description: "Run test suite", category: "test" },
      { command: `${mvn} package`, description: "Build JAR/WAR artifact", category: "build" },
      { command: `${mvn} clean package -DskipTests`, description: "Clean build (skip tests)", category: "build" },
      { command: `${mvn} dependency:tree`, description: "Show dependency tree", category: "other" },
    );
  }

  // Flyway commands
  if (buildFile.includes("flyway")) {
    if (buildTool === "gradle") {
      const gradle = hasWrapper ? "./gradlew" : "gradle";
      enrichment.commands.push(
        { command: `${gradle} flywayMigrate`, description: "Run Flyway DB migrations", category: "db" },
        { command: `${gradle} flywayInfo`, description: "Show Flyway migration status", category: "db" },
      );
    } else if (buildTool === "maven") {
      const mvn = hasWrapper ? "./mvnw" : "mvn";
      enrichment.commands.push(
        { command: `${mvn} flyway:migrate`, description: "Run Flyway DB migrations", category: "db" },
        { command: `${mvn} flyway:info`, description: "Show Flyway migration status", category: "db" },
      );
    }
  }

  // Docker Compose
  if (existsSync(join(rootDir, "docker-compose.yml")) || existsSync(join(rootDir, "compose.yml"))) {
    enrichment.commands.push(
      { command: "docker compose up -d", description: "Start infrastructure services (DB, Redis, etc.)", category: "dev" },
      { command: "docker compose down", description: "Stop infrastructure services", category: "dev" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  if (buildFile.includes("starter-data-jpa") || buildFile.includes("hibernate")) {
    enrichment.database = {
      ormName: "JPA / Hibernate",
    };
    if (buildFile.includes("flyway")) {
      enrichment.database.migrationDir = "src/main/resources/db/migration";
    } else if (buildFile.includes("liquibase")) {
      enrichment.database.migrationDir = "src/main/resources/db/changelog";
    }
  }

  // ─── Testing ───────────────────────────────────────────────

  enrichment.testing = {
    framework: isKotlin ? "JUnit 5 + Kotlin Test" : "JUnit 5",
    testDir: `src/test/${lang}`,
    systemTestTools: [],
  };

  if (buildFile.includes("mockito")) enrichment.testing.systemTestTools!.push("Mockito (mocking)");
  if (buildFile.includes("testcontainers")) enrichment.testing.systemTestTools!.push("Testcontainers");
  if (buildFile.includes("rest-assured")) enrichment.testing.systemTestTools!.push("REST Assured (API testing)");
  if (buildFile.includes("wiremock")) enrichment.testing.systemTestTools!.push("WireMock (HTTP mocking)");
  if (buildFile.includes("spring-boot-starter-test")) enrichment.testing.systemTestTools!.push("Spring Boot Test (@SpringBootTest)");
  if (buildFile.includes("assertj")) enrichment.testing.systemTestTools!.push("AssertJ (fluent assertions)");

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T modify auto-generated files in target/ or build/",
      reason: "Build output directories are auto-generated. Changes are overwritten on next build",
      severity: "critical",
    },
    {
      rule: "DON'T modify Flyway migrations after they've been applied",
      reason: "Flyway validates checksums. Editing an applied migration breaks the migration history. Create a new V{n+1}__ migration instead",
      severity: "critical",
    },
    {
      rule: "DON'T use field injection (`@Autowired` on fields)",
      reason: "Use constructor injection instead. Field injection makes classes untestable and hides dependencies. Spring recommends constructor injection",
      severity: "important",
    },
    {
      rule: "DON'T expose JPA entities directly in REST responses",
      reason: "Use DTOs to control serialized shape. Entities may have lazy-loaded proxies, circular references, or expose internal fields",
      severity: "critical",
    },
    {
      rule: "DON'T forget `@Transactional` on service methods that modify data",
      reason: "Without @Transactional, each repository call runs in its own transaction. Failures mid-operation leave data in inconsistent state",
      severity: "critical",
    },
    {
      rule: "DON'T catch exceptions silently in @Service methods",
      reason: "@Transactional needs uncaught RuntimeExceptions to trigger rollback. Catching and swallowing exceptions prevents rollback",
      severity: "important",
    },
    {
      rule: "DON'T put business logic in @Controller classes",
      reason: "Controllers should delegate to @Service classes. This keeps controllers thin and services testable without the web layer",
      severity: "important",
    },
    {
      rule: "DON'T use `spring.jpa.hibernate.ddl-auto=update` in production",
      reason: "Hibernate DDL auto-update can lose data and doesn't handle rollbacks. Use Flyway or Liquibase for production migrations",
      severity: "critical",
    },
    {
      rule: "DON'T store secrets in application.properties/yml",
      reason: "Use environment variables, Spring Cloud Config, or a secrets manager. Config files are committed to version control",
      severity: "critical",
    },
    {
      rule: "ALWAYS use `@Valid` or `@Validated` on request DTOs",
      reason: "Bean Validation annotations (@NotNull, @Size, etc.) are only enforced if the DTO parameter is annotated with @Valid",
      severity: "important",
    },
  );

  // Spring Security gotchas
  if (buildFile.includes("starter-security") || buildFile.includes("spring-security")) {
    enrichment.gotchas.push(
      {
        rule: "DON'T disable CSRF protection globally without reason",
        reason: "CSRF is needed for browser-based sessions. Only disable for stateless JWT APIs. Use `.csrf().ignoringRequestMatchers()` for selective disable",
        severity: "critical",
      },
      {
        rule: "DON'T forget to configure SecurityFilterChain bean",
        reason: "Spring Security 6+ uses component-based config (SecurityFilterChain @Bean). WebSecurityConfigurerAdapter is deprecated",
        severity: "important",
      },
    );
  }

  // Lombok gotchas
  if (buildFile.includes("lombok")) {
    enrichment.gotchas.push({
      rule: "DON'T use `@Data` on JPA entities",
      reason: "@Data generates equals/hashCode using all fields, which breaks with lazy-loaded associations. Use @Getter/@Setter and manual equals/hashCode on entities",
      severity: "important",
    });
  }

  return enrichment;
}
