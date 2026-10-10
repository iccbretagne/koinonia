import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { Contract, HttpMethod } from "./contract";
import type { ContractEntry } from "./document";

/** Parcours des routes API et de leurs contrats, pour le générateur et son test (ADR-0023). */

export const API_DIR = join(process.cwd(), "src/app/api");

export interface RouteFile {
  /** Adresse (`/api/members/[id]`). */
  readonly path: string;
  readonly dir: string;
  /** Méthodes exportées par `route.ts`. */
  readonly methods: HttpMethod[];
  readonly hasContract: boolean;
}

const EXPORT_RE = /export\s+(?:async\s+function|const|function)\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+\{([^}]+)\}/g;

export function routeMethods(source: string): HttpMethod[] {
  const methods = new Set<HttpMethod>();
  for (const m of source.matchAll(EXPORT_RE)) {
    if (m[1]) methods.add(m[1] as HttpMethod);
    for (const name of m[2]?.split(",") ?? []) {
      const n = name.trim().split(/\s*:\s*/).pop();
      if (n && /^(GET|POST|PUT|PATCH|DELETE)$/.test(n)) methods.add(n as HttpMethod);
    }
  }
  return [...methods].sort();
}

export function listRouteFiles(dir = API_DIR, acc: RouteFile[] = []): RouteFile[] {
  const entries = readdirSync(dir);
  if (entries.includes("route.ts")) {
    const segments = relative(join(API_DIR, ".."), dir).split(sep);
    acc.push({
      path: "/" + segments.join("/"),
      dir,
      methods: routeMethods(readFileSync(join(dir, "route.ts"), "utf8")),
      hasContract: entries.includes("contract.ts"),
    });
  }
  for (const entry of entries) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listRouteFiles(full, acc);
  }
  return acc.sort((a, b) => a.path.localeCompare(b.path));
}

export async function loadContracts(routes: readonly RouteFile[]): Promise<ContractEntry[]> {
  const entries: ContractEntry[] = [];
  for (const route of routes) {
    if (!route.hasContract) continue;
    const mod = (await import(pathToFileURL(join(route.dir, "contract.ts")).href)) as { contract?: Contract };
    if (!mod.contract) throw new Error(`${route.path}/contract.ts n'exporte pas \`contract\``);
    entries.push({ path: route.path, contract: mod.contract });
  }
  return entries;
}
