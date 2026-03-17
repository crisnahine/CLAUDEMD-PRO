/**
 * Flutter / Dart Deep Analyzer
 *
 * Detects Flutter-specific patterns, state management solutions,
 * code generation, routing, database packages, and common gotchas.
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

export function analyzeFlutter(
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

  // Read pubspec.yaml
  const pubspecRaw = readSafe(join(rootDir, "pubspec.yaml")) ?? "";
  const analysisOptions = readSafe(join(rootDir, "analysis_options.yaml"));

  // Simple YAML dependency extraction (dependencies and dev_dependencies sections)
  const extractDeps = (yaml: string): Set<string> => {
    const deps = new Set<string>();
    const sections = ["dependencies:", "dev_dependencies:"];
    for (const section of sections) {
      const idx = yaml.indexOf(section);
      if (idx === -1) continue;
      const afterSection = yaml.slice(idx + section.length);
      const lines = afterSection.split("\n");
      for (const line of lines) {
        // Stop at next top-level key
        if (line.match(/^\S/) && !line.startsWith("#")) break;
        const depMatch = line.match(/^\s{2}(\w[\w_-]*):/);
        if (depMatch) {
          deps.add(depMatch[1]);
        }
      }
    }
    return deps;
  };

  const deps = extractDeps(pubspecRaw);
  const hasDep = (name: string): boolean => deps.has(name) || !!keyDeps[name];

  // Detect Flutter vs pure Dart
  const isFlutter = hasDep("flutter") || pubspecRaw.includes("flutter:");
  const isPureDart = !isFlutter;

  // ─── Entry Points ──────────────────────────────────────────

  const entryCandidates = [
    "lib/main.dart",
    "pubspec.yaml",
    "analysis_options.yaml",
    "build.yaml",
    "l10n.yaml",
  ];

  for (const c of entryCandidates) {
    if (existsSync(join(rootDir, c))) {
      enrichment.entryPoints.push(c);
    }
  }

  // Pure Dart entry
  if (isPureDart) {
    const dartEntries = ["bin/main.dart", "bin/server.dart", "lib/src/server.dart"];
    for (const c of dartEntries) {
      if (existsSync(join(rootDir, c))) {
        enrichment.entryPoints.push(c);
      }
    }
  }

  // ─── Directory Purposes ────────────────────────────────────

  enrichment.dirPurposes = {
    "lib/": "Main Dart source code",
    "lib/src/": "Private library implementation (not exported directly)",
    "test/": "Unit and widget tests",
    "assets/": "Static assets (images, fonts, JSON files)",
  };

  if (isFlutter) {
    enrichment.dirPurposes["android/"] = "Android platform project (Gradle, AndroidManifest)";
    enrichment.dirPurposes["ios/"] = "iOS platform project (Xcode, Info.plist)";
    enrichment.dirPurposes["web/"] = "Web platform support (index.html, favicon)";

    const flutterDirs: Record<string, string> = {
      "linux/": "Linux desktop platform project",
      "macos/": "macOS desktop platform project",
      "windows/": "Windows desktop platform project",
      "integration_test/": "Integration/end-to-end tests (run on device/emulator)",
      "lib/models/": "Data models and entities",
      "lib/screens/": "Screen/page widgets",
      "lib/pages/": "Page widgets (route targets)",
      "lib/widgets/": "Reusable widget components",
      "lib/services/": "Service layer (API clients, business logic)",
      "lib/providers/": "State management providers (Provider/Riverpod)",
      "lib/blocs/": "BLoC state management classes",
      "lib/cubits/": "Cubit state management classes",
      "lib/controllers/": "GetX or custom controllers",
      "lib/repositories/": "Repository pattern (data access layer)",
      "lib/routes/": "Route/navigation definitions",
      "lib/theme/": "App theme and styling constants",
      "lib/utils/": "Utility functions and helpers",
      "lib/constants/": "App-wide constants",
      "lib/l10n/": "Localization/internationalization files",
      "lib/generated/": "Auto-generated code (freezed, json_serializable, etc.)",
      "lib/core/": "Core/shared functionality across features",
      "lib/features/": "Feature-based directory structure",
      "lib/data/": "Data layer (models, repositories, data sources)",
      "lib/domain/": "Domain layer (entities, use cases)",
      "lib/presentation/": "Presentation layer (widgets, screens, state)",
    };

    for (const [dir, purpose] of Object.entries(flutterDirs)) {
      if (existsSync(join(rootDir, dir))) {
        enrichment.dirPurposes[dir] = purpose;
      }
    }
  }

  // ─── Notable Dependencies ──────────────────────────────────

  const depChecks: Array<{ name: string; pattern: string; label: string }> = [
    // State management
    { name: "provider", pattern: "provider", label: "Provider (state management)" },
    { name: "flutter_riverpod", pattern: "flutter_riverpod", label: "Riverpod (reactive state management)" },
    { name: "riverpod", pattern: "riverpod", label: "Riverpod (state management)" },
    { name: "flutter_bloc", pattern: "flutter_bloc", label: "BLoC (Business Logic Component pattern)" },
    { name: "bloc", pattern: "bloc", label: "BLoC core library" },
    { name: "get", pattern: "get", label: "GetX (state management + routing + DI)" },
    { name: "mobx", pattern: "mobx", label: "MobX (reactive state management)" },
    // DI
    { name: "get_it", pattern: "get_it", label: "get_it (service locator / DI)" },
    { name: "injectable", pattern: "injectable", label: "Injectable (code-gen DI for get_it)" },
    // Networking
    { name: "dio", pattern: "dio", label: "Dio (HTTP client)" },
    { name: "http", pattern: "http", label: "http (Dart HTTP client)" },
    { name: "retrofit", pattern: "retrofit", label: "Retrofit (type-safe HTTP client)" },
    { name: "graphql_flutter", pattern: "graphql_flutter", label: "GraphQL Flutter client" },
    // Code generation
    { name: "freezed", pattern: "freezed", label: "Freezed (immutable data classes + unions)" },
    { name: "freezed_annotation", pattern: "freezed_annotation", label: "Freezed annotations" },
    { name: "json_serializable", pattern: "json_serializable", label: "json_serializable (JSON code generation)" },
    { name: "json_annotation", pattern: "json_annotation", label: "JSON annotation classes" },
    { name: "build_runner", pattern: "build_runner", label: "build_runner (Dart code generation)" },
    // Routing
    { name: "go_router", pattern: "go_router", label: "GoRouter (declarative routing)" },
    { name: "auto_route", pattern: "auto_route", label: "AutoRoute (code-generated routing)" },
    { name: "beamer", pattern: "beamer", label: "Beamer (declarative navigation)" },
    // Database / storage
    { name: "drift", pattern: "drift", label: "Drift (reactive SQLite for Dart/Flutter)" },
    { name: "hive", pattern: "hive", label: "Hive (lightweight NoSQL database)" },
    { name: "hive_flutter", pattern: "hive_flutter", label: "Hive Flutter integration" },
    { name: "sqflite", pattern: "sqflite", label: "sqflite (SQLite plugin)" },
    { name: "isar", pattern: "isar", label: "Isar (high-performance NoSQL database)" },
    { name: "shared_preferences", pattern: "shared_preferences", label: "SharedPreferences (key-value storage)" },
    // Firebase
    { name: "firebase_core", pattern: "firebase_core", label: "Firebase Core" },
    { name: "firebase_auth", pattern: "firebase_auth", label: "Firebase Authentication" },
    { name: "cloud_firestore", pattern: "cloud_firestore", label: "Cloud Firestore" },
    { name: "firebase_messaging", pattern: "firebase_messaging", label: "Firebase Cloud Messaging (push)" },
    // UI
    { name: "flutter_hooks", pattern: "flutter_hooks", label: "Flutter Hooks (React-style hooks)" },
    { name: "cached_network_image", pattern: "cached_network_image", label: "Cached network image loading" },
    { name: "flutter_svg", pattern: "flutter_svg", label: "SVG rendering" },
    // Internationalization
    { name: "intl", pattern: "intl", label: "intl (internationalization/localization)" },
    { name: "flutter_localizations", pattern: "flutter_localizations", label: "Flutter built-in localizations" },
    // Testing
    { name: "flutter_test", pattern: "flutter_test", label: "Flutter test framework" },
    { name: "mockito", pattern: "mockito", label: "Mockito (mocking for Dart)" },
    { name: "mocktail", pattern: "mocktail", label: "Mocktail (mocking without codegen)" },
    { name: "bloc_test", pattern: "bloc_test", label: "BLoC test utilities" },
    // Assets
    { name: "flutter_gen", pattern: "flutter_gen", label: "FlutterGen (asset code generation)" },
    { name: "flutter_launcher_icons", pattern: "flutter_launcher_icons", label: "App icon generator" },
    { name: "flutter_native_splash", pattern: "flutter_native_splash", label: "Native splash screen generator" },
  ];

  for (const dep of depChecks) {
    if (hasDep(dep.pattern)) {
      enrichment.notableDeps.push(dep);
    }
  }

  // ─── Patterns ──────────────────────────────────────────────

  if (isFlutter) {
    enrichment.patterns.push({ check: "Flutter detected", label: "Flutter cross-platform application" });
  } else {
    enrichment.patterns.push({ check: "Dart detected", label: "Pure Dart application" });
  }

  // State management
  if (hasDep("flutter_riverpod") || hasDep("riverpod")) {
    enrichment.patterns.push({ check: "Riverpod detected", label: "Riverpod state management" });
  } else if (hasDep("flutter_bloc") || hasDep("bloc")) {
    enrichment.patterns.push({ check: "BLoC detected", label: "BLoC pattern (events → states)" });
  } else if (hasDep("provider")) {
    enrichment.patterns.push({ check: "Provider detected", label: "Provider state management" });
  } else if (hasDep("get")) {
    enrichment.patterns.push({ check: "GetX detected", label: "GetX (state + routing + DI)" });
  }

  // Code generation
  if (hasDep("freezed") || hasDep("json_serializable")) {
    enrichment.patterns.push({ check: "Code generation", label: "Dart code generation (build_runner)" });
  }

  if (hasDep("freezed")) {
    enrichment.patterns.push({ check: "Freezed detected", label: "Freezed immutable models + union types" });
  }

  // Routing
  if (hasDep("go_router")) {
    enrichment.patterns.push({ check: "GoRouter detected", label: "Declarative routing (GoRouter)" });
  } else if (hasDep("auto_route")) {
    enrichment.patterns.push({ check: "AutoRoute detected", label: "Code-generated routing (AutoRoute)" });
  }

  // Firebase
  if (hasDep("firebase_core")) {
    enrichment.patterns.push({ check: "Firebase detected", label: "Firebase integration" });
  }

  // Clean architecture
  if (existsSync(join(rootDir, "lib/domain")) && existsSync(join(rootDir, "lib/data")) && existsSync(join(rootDir, "lib/presentation"))) {
    enrichment.patterns.push({ check: "Clean architecture dirs", label: "Clean Architecture (domain/data/presentation layers)" });
  }

  // Feature-first
  if (existsSync(join(rootDir, "lib/features"))) {
    enrichment.patterns.push({ check: "Feature-first structure", label: "Feature-first directory structure" });
  }

  if (hasDep("get_it")) {
    enrichment.patterns.push({ check: "get_it detected", label: "Service locator pattern (get_it)" });
  }

  // ─── Commands ──────────────────────────────────────────────

  if (isFlutter) {
    enrichment.commands.push(
      { command: "flutter run", description: "Run the app on a connected device/emulator", category: "dev" },
      { command: "flutter run -d chrome", description: "Run the app in Chrome (web)", category: "dev" },
      { command: "flutter test", description: "Run all unit and widget tests", category: "test" },
      { command: "flutter test --coverage", description: "Run tests with code coverage", category: "test" },
      { command: "flutter build apk", description: "Build Android APK", category: "build" },
      { command: "flutter build appbundle", description: "Build Android App Bundle (AAB)", category: "build" },
      { command: "flutter build ios", description: "Build iOS release", category: "build" },
      { command: "flutter build web", description: "Build for web deployment", category: "build" },
      { command: "flutter analyze", description: "Run Dart static analysis", category: "lint" },
      { command: "dart fix --apply", description: "Apply automated code fixes", category: "lint" },
      { command: "flutter pub get", description: "Fetch dependencies", category: "build" },
      { command: "flutter clean", description: "Clean build artifacts", category: "build" },
    );
  } else {
    enrichment.commands.push(
      { command: "dart run", description: "Run the Dart application", category: "dev" },
      { command: "dart test", description: "Run all tests", category: "test" },
      { command: "dart compile exe bin/main.dart", description: "Compile to native executable", category: "build" },
      { command: "dart analyze", description: "Run Dart static analysis", category: "lint" },
      { command: "dart fix --apply", description: "Apply automated code fixes", category: "lint" },
      { command: "dart pub get", description: "Fetch dependencies", category: "build" },
    );
  }

  // Code generation
  if (hasDep("build_runner")) {
    enrichment.commands.push(
      { command: "dart run build_runner build --delete-conflicting-outputs", description: "Run code generation (freezed, json_serializable, etc.)", category: "build" },
      { command: "dart run build_runner watch --delete-conflicting-outputs", description: "Watch and regenerate code on file changes", category: "dev" },
    );
  }

  // Integration tests
  if (existsSync(join(rootDir, "integration_test"))) {
    enrichment.commands.push(
      { command: "flutter test integration_test", description: "Run integration tests on device/emulator", category: "test" },
    );
  }

  // Flutter Gen
  if (hasDep("flutter_gen")) {
    enrichment.commands.push(
      { command: "dart run flutter_gen", description: "Generate asset references", category: "build" },
    );
  }

  // Icons and splash
  if (hasDep("flutter_launcher_icons")) {
    enrichment.commands.push(
      { command: "dart run flutter_launcher_icons", description: "Generate app launcher icons", category: "build" },
    );
  }

  if (hasDep("flutter_native_splash")) {
    enrichment.commands.push(
      { command: "dart run flutter_native_splash:create", description: "Generate native splash screens", category: "build" },
    );
  }

  // ─── Database ──────────────────────────────────────────────

  if (hasDep("drift")) {
    enrichment.database = {
      ormName: "Drift",
      migrationDir: existsSync(join(rootDir, "lib/database")) ? "lib/database/" : undefined,
    };
  } else if (hasDep("hive") || hasDep("hive_flutter")) {
    enrichment.database = { ormName: "Hive (NoSQL)" };
  } else if (hasDep("sqflite")) {
    enrichment.database = { ormName: "sqflite (SQLite)" };
  } else if (hasDep("isar")) {
    enrichment.database = { ormName: "Isar (NoSQL)" };
  } else if (hasDep("cloud_firestore")) {
    enrichment.database = { ormName: "Cloud Firestore" };
  }

  // ─── Testing ───────────────────────────────────────────────

  enrichment.testing = {
    framework: isFlutter ? "flutter_test" : "dart test",
    testDir: "test/",
    systemTestTools: [],
  };

  if (existsSync(join(rootDir, "integration_test"))) {
    enrichment.testing.systemTestTools!.push("integration_test (on-device/emulator E2E)");
  }
  if (hasDep("mockito")) {
    enrichment.testing.systemTestTools!.push("Mockito (mock generation)");
  }
  if (hasDep("mocktail")) {
    enrichment.testing.systemTestTools!.push("Mocktail (mocking without codegen)");
  }
  if (hasDep("bloc_test")) {
    enrichment.testing.systemTestTools!.push("bloc_test (BLoC testing utilities)");
  }

  // ─── Gotchas ───────────────────────────────────────────────

  enrichment.gotchas.push(
    {
      rule: "DON'T modify generated .g.dart or .freezed.dart files",
      reason: "These files are auto-generated by build_runner from annotations. Edits are overwritten on the next build. Modify the source file and re-run `dart run build_runner build`",
      severity: "critical",
    },
    {
      rule: "DON'T use setState for complex state — use a state management solution",
      reason: "setState only works within a single StatefulWidget and causes full widget rebuilds. For shared or complex state, use Provider, Riverpod, BLoC, or another state management approach",
      severity: "important",
    },
    {
      rule: "DON'T store secrets or API keys in Dart source code",
      reason: "Dart/Flutter code is easily decompiled. Secrets in source code are visible in APK/IPA bundles. Use environment variables, dart-define, or a backend proxy for sensitive values",
      severity: "critical",
    },
    {
      rule: "DON'T rebuild the entire widget tree unnecessarily",
      reason: "Placing state high in the widget tree causes expensive rebuilds. Use Consumer/Selector (Provider), watch/select (Riverpod), or BlocBuilder with buildWhen to minimize rebuilds",
      severity: "important",
    },
    {
      rule: "ALWAYS use const constructors where possible",
      reason: "const constructors create compile-time constants that Flutter can skip during rebuilds. Omitting const on eligible widgets degrades performance, especially in lists and repeated layouts",
      severity: "important",
    },
    {
      rule: "DON'T put business logic inside widget build methods",
      reason: "build() can be called many times per second. Business logic, API calls, and heavy computation in build() cause jank and duplicate work. Move logic to services, BLoCs, or controllers",
      severity: "critical",
    },
    {
      rule: "DON'T ignore analysis_options.yaml lint rules",
      reason: "analysis_options.yaml enforces project-wide code quality standards. Disabling rules via // ignore or removing them from config hides real issues. Fix the underlying problem instead",
      severity: "important",
    },
    {
      rule: "DON'T commit pubspec.lock for published packages (only for applications)",
      reason: "For apps, pubspec.lock ensures reproducible builds and should be committed. For published packages, it prevents consumers from resolving compatible dependency versions",
      severity: "nice-to-have",
    },
    {
      rule: "DON'T forget to dispose controllers, streams, and animation controllers",
      reason: "Undisposed resources cause memory leaks. Always override dispose() in StatefulWidget to clean up TextEditingController, StreamSubscription, AnimationController, etc.",
      severity: "critical",
    },
  );

  return enrichment;
}
