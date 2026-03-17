/**
 * Domain Analyzer (Phase 4)
 *
 * Identifies business domains and key features by reading route files,
 * model files, and directory structure. Produces a map of what the
 * application actually does — not just how it's structured.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import type { StackProfile } from "./stack-detector.js";
import { scanFiles, type FileScanResult } from "./file-scanner.js";

// ─── Types ──────────────────────────────────────────────────

export interface Domain {
  name: string;
  description: string;
  keyFiles: string[];
  entities: string[];
  endpoints: string[];
}

export interface DomainProfile {
  domains: Domain[];
  keyFeatures: string[];
  entityCount: number;
}

// ─── Domain keyword detection ───────────────────────────────

const DOMAIN_KEYWORDS: Record<string, string> = {
  auth: "Authentication & authorization",
  authentication: "Authentication & authorization",
  authorization: "Authentication & authorization",
  user: "User management",
  users: "User management",
  account: "Account management",
  accounts: "Account management",
  profile: "User profiles",
  payment: "Payment processing",
  payments: "Payment processing",
  billing: "Billing & subscriptions",
  subscription: "Billing & subscriptions",
  subscriptions: "Billing & subscriptions",
  stripe: "Payment processing (Stripe)",
  order: "Order management",
  orders: "Order management",
  cart: "Shopping cart",
  checkout: "Checkout flow",
  product: "Product catalog",
  products: "Product catalog",
  catalog: "Product catalog",
  inventory: "Inventory management",
  notification: "Notifications",
  notifications: "Notifications",
  email: "Email & messaging",
  mail: "Email & messaging",
  message: "Messaging",
  messages: "Messaging",
  chat: "Real-time chat",
  search: "Search functionality",
  admin: "Admin panel",
  dashboard: "Dashboard & analytics",
  analytics: "Analytics & reporting",
  report: "Reporting",
  reports: "Reporting",
  upload: "File uploads",
  uploads: "File uploads",
  media: "Media management",
  image: "Image processing",
  api: "API layer",
  webhook: "Webhook handling",
  webhooks: "Webhook handling",
  job: "Background jobs",
  jobs: "Background jobs",
  queue: "Job queue",
  worker: "Background workers",
  settings: "Application settings",
  config: "Configuration",
  permission: "Permissions & roles",
  permissions: "Permissions & roles",
  role: "Roles & access control",
  roles: "Roles & access control",
  team: "Team management",
  teams: "Team management",
  organization: "Organization management",
  org: "Organization management",
  project: "Project management",
  projects: "Project management",
  task: "Task management",
  tasks: "Task management",
  comment: "Comments & discussions",
  comments: "Comments & discussions",
  review: "Reviews & ratings",
  tag: "Tagging & categorization",
  tags: "Tagging & categorization",
  category: "Categories",
  categories: "Categories",
  blog: "Blog / content",
  post: "Posts / content",
  posts: "Posts / content",
  article: "Articles / content",
  content: "Content management",
  page: "Pages / CMS",
  pages: "Pages / CMS",
  session: "Session management",
  token: "Token management",
  invite: "Invitation system",
  invites: "Invitation system",
  onboarding: "User onboarding",
  feed: "Activity feed",
  activity: "Activity tracking",
  audit: "Audit logging",
  log: "Logging",
};

// ─── Entity extraction ──────────────────────────────────────

function extractEntities(filePath: string, content: string, stack: StackProfile): string[] {
  const entities: string[] = [];
  const ext = extname(filePath);

  // Ruby/Rails models
  if (stack.framework === "rails" && ext === ".rb") {
    const classMatch = content.match(/class\s+(\w+)\s*<\s*(?:ApplicationRecord|ActiveRecord::Base)/g);
    if (classMatch) {
      for (const m of classMatch) {
        const name = m.match(/class\s+(\w+)/)?.[1];
        if (name) entities.push(name);
      }
    }
  }

  // Python models (Django/SQLAlchemy)
  if (stack.language === "python") {
    const classMatch = content.match(/class\s+(\w+)\(.*(?:models\.Model|db\.Model|Base)\)/g);
    if (classMatch) {
      for (const m of classMatch) {
        const name = m.match(/class\s+(\w+)/)?.[1];
        if (name) entities.push(name);
      }
    }
  }

  // TypeScript/JS — interface/type/class exports
  if (ext === ".ts" || ext === ".tsx" || ext === ".js") {
    const exportMatch = content.match(/export\s+(?:interface|type|class)\s+(\w+)/g);
    if (exportMatch) {
      for (const m of exportMatch) {
        const name = m.match(/(?:interface|type|class)\s+(\w+)/)?.[1];
        if (name && name[0] === name[0].toUpperCase()) entities.push(name);
      }
    }
  }

  // Java classes
  if (ext === ".java") {
    const classMatch = content.match(/public\s+class\s+(\w+)/g);
    if (classMatch) {
      for (const m of classMatch) {
        const name = m.match(/class\s+(\w+)/)?.[1];
        if (name) entities.push(name);
      }
    }
  }

  // Go structs
  if (ext === ".go") {
    const structMatch = content.match(/type\s+(\w+)\s+struct/g);
    if (structMatch) {
      for (const m of structMatch) {
        const name = m.match(/type\s+(\w+)/)?.[1];
        if (name) entities.push(name);
      }
    }
  }

  // Rust structs
  if (ext === ".rs") {
    const structMatch = content.match(/(?:pub\s+)?struct\s+(\w+)/g);
    if (structMatch) {
      for (const m of structMatch) {
        const name = m.match(/struct\s+(\w+)/)?.[1];
        if (name) entities.push(name);
      }
    }
  }

  // PHP/Laravel models
  if (ext === ".php") {
    const classMatch = content.match(/class\s+(\w+)\s+extends\s+Model/g);
    if (classMatch) {
      for (const m of classMatch) {
        const name = m.match(/class\s+(\w+)/)?.[1];
        if (name) entities.push(name);
      }
    }
  }

  return entities;
}

// ─── Endpoint extraction ────────────────────────────────────

function extractEndpoints(filePath: string, content: string, stack: StackProfile): string[] {
  const endpoints: string[] = [];

  // Rails routes
  if (stack.framework === "rails" && filePath.includes("routes")) {
    const resourceMatch = content.match(/resources?\s+:(\w+)/g);
    if (resourceMatch) {
      for (const m of resourceMatch) {
        const name = m.match(/:(\w+)/)?.[1];
        if (name) endpoints.push(`/${name}`);
      }
    }
  }

  // Express/Fastify/Hono routes
  if (["express", "fastify", "hono", "nestjs"].includes(stack.framework)) {
    const routeMatch = content.match(/\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)/g);
    if (routeMatch) {
      for (const m of routeMatch) {
        const path = m.match(/['"`]([^'"`]+)/)?.[1];
        if (path) endpoints.push(path);
      }
    }
  }

  // Next.js App Router — derive from file path
  if (stack.framework === "nextjs" && /\/route\.[^.]+$/.test(filePath)) {
    const routePath = filePath
      .replace(/^src\/app/, "")
      .replace(/\/route\.[^.]+$/, "")
      .replace(/\[([^\]]+)\]/g, ":$1");
    if (routePath) endpoints.push(routePath || "/");
  }

  // Django urls
  if (stack.framework === "django" && filePath.includes("urls")) {
    const pathMatch = content.match(/path\s*\(\s*['"]([^'"]*)['"]/g);
    if (pathMatch) {
      for (const m of pathMatch) {
        const path = m.match(/['"]([^'"]*)['"]/)?.[1];
        if (path !== undefined) endpoints.push(`/${path}`);
      }
    }
  }

  // FastAPI routes
  if (stack.framework === "fastapi") {
    const routeMatch = content.match(/@(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)/g);
    if (routeMatch) {
      for (const m of routeMatch) {
        const path = m.match(/['"]([^'"]+)/)?.[1];
        if (path) endpoints.push(path);
      }
    }
  }

  // Laravel routes
  if (stack.framework === "laravel" && filePath.includes("routes")) {
    const routeMatch = content.match(/Route::(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)/g);
    if (routeMatch) {
      for (const m of routeMatch) {
        const path = m.match(/['"]([^'"]+)/)?.[1];
        if (path) endpoints.push(path);
      }
    }
  }

  // Spring controllers
  if (stack.framework === "spring") {
    const mappingMatch = content.match(/@(?:Get|Post|Put|Delete|Patch|Request)Mapping\s*\(\s*(?:value\s*=\s*)?['"]([^'"]+)/g);
    if (mappingMatch) {
      for (const m of mappingMatch) {
        const path = m.match(/['"]([^'"]+)/)?.[1];
        if (path) endpoints.push(path);
      }
    }
  }

  return endpoints;
}

// ─── Safe file read ─────────────────────────────────────────

function readSafe(path: string, maxLines = 150): string | null {
  try {
    if (!existsSync(path)) return null;
    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n");
    return lines.slice(0, maxLines).join("\n");
  } catch {
    return null;
  }
}

// ─── Main export ────────────────────────────────────────────

export async function analyzeDomains(
  rootDir: string,
  stack: StackProfile,
  scan?: FileScanResult
): Promise<DomainProfile> {
  // Get file scan if not provided
  const fileScan = scan ?? scanFiles(rootDir, undefined, stack.framework);

  // Collect all categorized files
  const allFiles = [
    ...Object.values(fileScan.categories).flatMap((c) => c.files),
    ...fileScan.uncategorized,
  ];

  // Identify domains from directory names and file names
  const domainMap = new Map<string, { files: string[]; description: string }>();

  for (const file of allFiles) {
    const parts = file.split("/");
    for (const part of parts) {
      const lower = part.toLowerCase().replace(/[_-]/g, "");
      const desc = DOMAIN_KEYWORDS[lower];
      if (desc) {
        const existing = domainMap.get(desc);
        if (existing) {
          existing.files.push(file);
        } else {
          domainMap.set(desc, { files: [file], description: desc });
        }
        break; // One domain per file
      }
    }
  }

  // Read model/entity files to extract entities
  const allEntities: string[] = [];
  const modelFiles = [
    ...(fileScan.categories.models?.files ?? []),
    ...(fileScan.categories.schemas?.files ?? []),
  ].slice(0, 30); // Cap reads

  for (const file of modelFiles) {
    const content = readSafe(join(rootDir, file));
    if (content) {
      const entities = extractEntities(file, content, stack);
      allEntities.push(...entities);
    }
  }

  // Read route files to extract endpoints
  const allEndpoints: string[] = [];
  const routeFiles = [
    ...(fileScan.categories.routes?.files ?? []),
    ...(fileScan.categories.controllers?.files ?? []),
  ].slice(0, 20);

  for (const file of routeFiles) {
    const content = readSafe(join(rootDir, file));
    if (content) {
      const endpoints = extractEndpoints(file, content, stack);
      allEndpoints.push(...endpoints);
    }
  }

  // Build domain list
  const domains: Domain[] = [];
  for (const [description, data] of domainMap) {
    // Find entities related to this domain
    const domainEntities = allEntities.filter((e) => {
      const lower = e.toLowerCase();
      return data.files.some((f) => {
        const fLower = f.toLowerCase();
        return fLower.includes(lower) || lower.includes(fLower.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "");
      });
    });

    // Find endpoints related to this domain
    const domainEndpoints = allEndpoints.filter((ep) => {
      const epLower = ep.toLowerCase();
      return data.files.some((f) => {
        const parts = f.toLowerCase().split("/");
        return parts.some((p) => epLower.includes(p.replace(/\.[^.]+$/, "")));
      });
    });

    domains.push({
      name: description,
      description,
      keyFiles: data.files.slice(0, 5),
      entities: [...new Set(domainEntities)].slice(0, 5),
      endpoints: [...new Set(domainEndpoints)].slice(0, 5),
    });
  }

  // Sort by file count (most prominent domains first)
  domains.sort((a, b) => b.keyFiles.length - a.keyFiles.length);

  // Derive key features from domains + endpoints
  const keyFeatures: string[] = [];
  for (const domain of domains.slice(0, 8)) {
    if (domain.endpoints.length > 0) {
      keyFeatures.push(`${domain.name} (${domain.endpoints.length} endpoints)`);
    } else {
      keyFeatures.push(domain.name);
    }
  }

  return {
    domains: domains.slice(0, 12),
    keyFeatures: keyFeatures.slice(0, 10),
    entityCount: new Set(allEntities).size,
  };
}
