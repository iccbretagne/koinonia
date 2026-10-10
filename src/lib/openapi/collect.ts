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

const METHOD_ORDER: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function asMethod(name: string | undefined): HttpMethod | undefined {
  return METHOD_ORDER.find((m) => m === name);
}

/**
 * Méthodes exportées par un `route.ts`, ligne par ligne : `export async function GET(`,
 * `export const GET =`, ou déstructuration `export const { GET, POST: post } = handlers`.
 */
export function routeMethods(source: string): HttpMethod[] {
  const methods = new Set<HttpMethod>();
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("export ")) continue;
    const destructured = /^export const \{([^}]*)\}/.exec(line);
    const names = destructured
      ? destructured[1].split(",").map((part) => part.split(":")[0].trim())
      : line.split(/[\s(=<:]/).slice(1, 4);
    for (const name of names) {
      const method = asMethod(name);
      if (method) methods.add(method);
    }
  }
  return METHOD_ORDER.filter((m) => methods.has(m));
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
  return Promise.all(
    routes
      .filter((route) => route.hasContract)
      .map(async (route) => {
        const mod = (await import(pathToFileURL(join(route.dir, "contract.ts")).href)) as { contract?: Contract };
        if (!mod.contract) throw new Error(`${route.path}/contract.ts n'exporte pas \`contract\``);
        return { path: route.path, contract: mod.contract };
      })
  );
}
