import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { RouteTable } from "@/core/module-routes";
import { ROOT_MODULE } from "@/core/boot";
import { allManifests } from "../manifests";
import { NOYAU_ROUTES } from "../module-routes";

/**
 * Amendement d'ADR-0012 (spec 092, T0.2) : sur les **vrais** manifestes, couper un module rend
 * orphelines toutes ses adresses (pages et API), y compris celles placées sous un préfixe d'un
 * module actif ou du noyau ; aucune adresse d'un autre module ne change de propriétaire.
 */

const APP_DIR = join(__dirname, "../../app");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry === "route.ts" || entry === "page.tsx") acc.push(full);
  }
  return acc;
}

function toUrl(file: string): string {
  const segs = relative(APP_DIR, file).split(sep);
  segs.pop();
  const url = "/" + segs.filter((s) => !(s.startsWith("(") && s.endsWith(")"))).join("/");
  // Un segment dynamique est remplacé par une valeur quelconque, comme une vraie requête.
  return url.replace(/\[\[?\.{0,3}[^\]]+\]\]?/g, "x");
}

const urls = walk(APP_DIR).map(toUrl);
const names = allManifests.map((m) => m.name);
const disableable = names.filter((n) => n !== ROOT_MODULE);

describe("module coupé ⇒ adresses orphelines (ADR-0012 amendé)", () => {
  it.each(disableable)("%s coupé : ses adresses sont orphelines, les autres inchangées", (off) => {
    const table = new RouteTable([...allManifests], NOYAU_ROUTES, names.filter((n) => n !== off));
    let own = 0;
    for (const url of urls) {
      const declared = table.resolveDeclared(url);
      const effective = table.resolve(url);
      if (declared.owner === off) {
        own++;
        expect(effective.kind, `${url} (module ${off} coupé)`).toBe("orphan");
      } else {
        expect(effective, `${url} ne doit pas dépendre de ${off}`).toEqual(declared);
      }
    }
    // Le module `storage` est une infrastructure sans adresse propre.
    if (off !== "storage") expect(own).toBeGreaterThan(0);
  });

  it.each([
    ["messages", "/admin/messages"],
    ["messages", "/admin/messages/x"],
    ["shuttle", "/accounting/navette"],
    ["shuttle", "/api/accounting/navette"],
    ["treasury", "/accounting/tresorerie"],
    ["assistant", "/admin/assistant"],
    ["mcp", "/admin/mcp"],
    ["ticketing", "/admin/site-domains"],
  ])("%s coupé : %s est orphelin (sans repli sur le préfixe parent)", (off, path) => {
    const table = new RouteTable([...allManifests], NOYAU_ROUTES, names.filter((n) => n !== off));
    expect(table.resolveDeclared(path).owner).toBe(off);
    expect(table.resolve(path).kind).toBe("orphan");
  });
});
