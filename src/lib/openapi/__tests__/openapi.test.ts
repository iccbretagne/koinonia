import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fullRouteTable } from "@/lib/module-routes";
import { listRouteFiles, loadContracts, routeMethods } from "../collect";
import { buildOpenApiDocument } from "../document";

/**
 * ADR-0023 : chaque route API a un contrat qui couvre exactement ses méthodes, l'accès public
 * déclaré concorde avec les manifestes, et `docs/openapi.json` est à jour (`npm run openapi`).
 */

const routes = listRouteFiles();

/**
 * Adresses du noyau ouvertes sans session par `src/proxy.ts` (`isOpenWithoutSession`) hors
 * manifestes : poignée de main NextAuth et rapports CSP. Le cron, lui, se déclare `cron`.
 */
const NOYAU_OPEN = (path: string) => path.startsWith("/api/auth/") || path === "/api/csp-report";

describe("contrats OpenAPI des routes", () => {
  it("a trouvé les routes API", () => {
    expect(routes.length).toBeGreaterThan(150);
  });

  it.each(routes)("$path a un contrat pour chacune de ses méthodes", async (route) => {
    expect(route.hasContract, `${route.path} : créer contract.ts (ADR-0023)`).toBe(true);
    const [entry] = await loadContracts([route]);
    expect(Object.keys(entry.contract).sort()).toEqual(route.methods);
  });

  it.each(routes)("$path : accès public conforme au manifeste", async (route) => {
    if (!route.hasContract) return;
    const [entry] = await loadContracts([route]);
    for (const [method, op] of Object.entries(entry.contract)) {
      const isPublic = NOYAU_OPEN(route.path) || fullRouteTable.isPublic(route.path.replace(/\[[^\]]+\]/g, "x"), method);
      if (op.access === "public") expect(isPublic, `${method} ${route.path} déclaré public sans l'être au manifeste`).toBe(true);
    }
  });

  it("docs/openapi.json est à jour (npm run openapi)", async () => {
    const committed = JSON.parse(readFileSync(join(process.cwd(), "docs/openapi.json"), "utf8"));
    const generated = JSON.parse(JSON.stringify(buildOpenApiDocument(await loadContracts(routes), committed.info.version)));
    expect(generated).toEqual(committed);
  });
});

describe("routeMethods", () => {
  it("lit les méthodes exportées, y compris par déstructuration", () => {
    expect(routeMethods("export async function GET() {}\nexport const POST = handlers.POST;")).toEqual(["GET", "POST"]);
    expect(routeMethods("export const { GET, POST } = handlers;")).toEqual(["GET", "POST"]);
    expect(routeMethods("export async function assertX() {}\nexport const runtime = 'nodejs';")).toEqual([]);
  });
});
