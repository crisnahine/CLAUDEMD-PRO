// ─── src/analyzers/database.ts ───────────────────────────────
/**
 * Database Analyzer
 *
 * Detects database type, ORM, migration setup, and key schema info.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { StackProfile } from "./stack-detector.js";

export interface DatabaseProfile {
  adapter: string | null; // postgresql, mysql, sqlite3
  orm: string | null; // ActiveRecord, Prisma, Drizzle, SQLAlchemy
  tableCount: number;
  hasMigrations: boolean;
  migrationDir: string | null;
  keyModels: string[];
}

export async function analyzeDatabase(
  rootDir: string,
  stack: StackProfile
): Promise<DatabaseProfile> {
  const profile: DatabaseProfile = {
    adapter: null,
    orm: null,
    tableCount: 0,
    hasMigrations: false,
    migrationDir: null,
    keyModels: [],
  };

  // Rails: read database.yml and schema.rb
  if (stack.framework === "rails") {
    profile.orm = "ActiveRecord";

    const dbYml = readSafe(join(rootDir, "config/database.yml"));
    if (dbYml) {
      if (dbYml.includes("postgresql")) profile.adapter = "postgresql";
      else if (dbYml.includes("mysql")) profile.adapter = "mysql";
      else if (dbYml.includes("sqlite")) profile.adapter = "sqlite3";
    }

    const schema = readSafe(join(rootDir, "db/schema.rb"));
    if (schema) {
      const tables = schema.match(/create_table/g);
      profile.tableCount = tables?.length ?? 0;
    }

    if (existsSync(join(rootDir, "db/migrate"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "db/migrate";
    }

    // List model files
    const modelsDir = join(rootDir, "app/models");
    if (existsSync(modelsDir)) {
      profile.keyModels = readdirSync(modelsDir)
        .filter((f) => f.endsWith(".rb") && f !== "application_record.rb")
        .map((f) => f.replace(".rb", ""))
        .slice(0, 20);
    }
  }

  // Prisma
  if (stack.keyDeps["@prisma/client"] || existsSync(join(rootDir, "prisma/schema.prisma"))) {
    profile.orm = "Prisma";
    const prismaSchema = readSafe(join(rootDir, "prisma/schema.prisma"));
    if (prismaSchema) {
      if (prismaSchema.includes("postgresql")) profile.adapter = "postgresql";
      else if (prismaSchema.includes("mysql")) profile.adapter = "mysql";
      else if (prismaSchema.includes("sqlite")) profile.adapter = "sqlite3";

      const models = prismaSchema.match(/^model\s+(\w+)/gm);
      profile.tableCount = models?.length ?? 0;
      profile.keyModels =
        models?.map((m) => m.replace("model ", "")).slice(0, 20) ?? [];
    }
    profile.hasMigrations = existsSync(join(rootDir, "prisma/migrations"));
    profile.migrationDir = "prisma/migrations";
  }

  // Drizzle
  if (stack.keyDeps["drizzle-orm"]) {
    profile.orm = "Drizzle";
  }

  // Django (SQLAlchemy / Django ORM)
  if (stack.framework === "django") {
    profile.orm = "Django ORM";
    // Check settings.py for database config
    const settingsFiles = ["config/settings.py", "settings.py", "config/settings/base.py"];
    for (const sf of settingsFiles) {
      const settings = readSafe(join(rootDir, sf));
      if (settings) {
        if (settings.includes("postgresql") || settings.includes("psycopg")) profile.adapter = "postgresql";
        else if (settings.includes("mysql")) profile.adapter = "mysql";
        else if (settings.includes("sqlite")) profile.adapter = "sqlite3";
        break;
      }
    }
    // Count models by scanning for class X(models.Model)
    const appDirs = readdirSync(rootDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(rootDir, d.name, "models.py")));
    for (const dir of appDirs) {
      const models = readSafe(join(rootDir, dir.name, "models.py"));
      if (models) {
        const modelClasses = models.match(/class\s+\w+\(.*Model\)/g);
        profile.tableCount += modelClasses?.length ?? 0;
        profile.keyModels.push(
          ...(modelClasses?.map((m) => m.match(/class\s+(\w+)/)?.[1] ?? "").filter(Boolean).slice(0, 10) ?? [])
        );
      }
    }
    if (existsSync(join(rootDir, "migrations")) || appDirs.some((d) => existsSync(join(rootDir, d.name, "migrations")))) {
      profile.hasMigrations = true;
      profile.migrationDir = "*/migrations";
    }
  }

  // FastAPI / Flask with SQLAlchemy
  if ((stack.framework === "fastapi" || stack.framework === "flask") && stack.keyDeps["sqlalchemy"]) {
    profile.orm = "SQLAlchemy";
    if (existsSync(join(rootDir, "alembic.ini"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "alembic/versions";
    }
    if (existsSync(join(rootDir, "migrations"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "migrations";
    }
  }

  // Laravel (Eloquent)
  if (stack.framework === "laravel") {
    profile.orm = "Eloquent";
    const envFile = readSafe(join(rootDir, ".env"));
    if (envFile) {
      if (envFile.includes("DB_CONNECTION=pgsql")) profile.adapter = "postgresql";
      else if (envFile.includes("DB_CONNECTION=mysql")) profile.adapter = "mysql";
      else if (envFile.includes("DB_CONNECTION=sqlite")) profile.adapter = "sqlite3";
    }
    if (existsSync(join(rootDir, "database/migrations"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "database/migrations";
      const migrations = readdirSync(join(rootDir, "database/migrations")).filter((f) => f.endsWith(".php"));
      profile.tableCount = migrations.filter((f) => f.includes("create_")).length;
    }
    if (existsSync(join(rootDir, "app/Models"))) {
      profile.keyModels = readdirSync(join(rootDir, "app/Models"))
        .filter((f) => f.endsWith(".php") && f !== "Model.php")
        .map((f) => f.replace(".php", ""))
        .slice(0, 20);
    }
  }

  // Phoenix (Ecto)
  if (stack.framework === "phoenix") {
    profile.orm = "Ecto";
    if (existsSync(join(rootDir, "priv/repo/migrations"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "priv/repo/migrations";
    }
  }

  // Go GORM
  if (stack.language === "go" && (stack.keyDeps["gorm.io/gorm"] || stack.keyDeps["github.com/go-gorm/gorm"])) {
    profile.orm = "GORM";
  }

  // Rust Diesel
  if (stack.language === "rust" && stack.keyDeps["diesel"]) {
    profile.orm = "Diesel";
    if (existsSync(join(rootDir, "migrations"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "migrations";
    }
  }

  // Rust SQLx
  if (stack.language === "rust" && stack.keyDeps["sqlx"]) {
    profile.orm = profile.orm ?? "SQLx";
    if (existsSync(join(rootDir, "migrations"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "migrations";
    }
  }

  // Spring JPA
  if (stack.framework === "spring") {
    profile.orm = "JPA/Hibernate";
    const appProps = readSafe(join(rootDir, "src/main/resources/application.properties"))
      ?? readSafe(join(rootDir, "src/main/resources/application.yml"));
    if (appProps) {
      if (appProps.includes("postgresql")) profile.adapter = "postgresql";
      else if (appProps.includes("mysql")) profile.adapter = "mysql";
      else if (appProps.includes("h2")) profile.adapter = "h2";
    }
    if (existsSync(join(rootDir, "src/main/resources/db/migration"))) {
      profile.hasMigrations = true;
      profile.migrationDir = "src/main/resources/db/migration";
    }
  }

  return profile;
}

function readSafe(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : null;
  } catch {
    return null;
  }
}
