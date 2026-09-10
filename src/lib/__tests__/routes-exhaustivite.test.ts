import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fullRouteTable, NOYAU_ROUTES } from "../module-routes";
import { allManifests } from "../manifests";

/**
 * Test-clé de la spec 038 : toute adresse de l'application (`route.ts`, `page.tsx`) doit
 * être revendiquée par exactement un module ou par le noyau (`NOYAU_ROUTES`). Une adresse
 * orpheline resterait joignable sur toutes les instances sans que personne ne l'ait décidé
 * — c'est le défaut que la feature existe pour empêcher, il ne doit pas pouvoir se
 * réintroduire en silence (critère d'acceptation « vérification automatique »).
 *
 * Symétrique : un préfixe déclaré dans un manifeste qui ne correspond à aucun fichier réel
 * est probablement une faute de frappe ou un vestige — signalé aussi.
 */

const APP_DIR = join(__dirname, "../../app");

/** Fichiers qui définissent une adresse joignable. */
const ROUTE_FILES = new Set(["route.ts", "page.tsx"]);

/** Dossiers à ignorer : tests, composants privés, fichiers non-adresses. */
const IGNORED_DIR_NAMES = new Set(["__tests__"]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, acc);
    } else if (ROUTE_FILES.has(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Convertit un chemin de fichier `route.ts`/`page.tsx` en chemin d'URL. */
function toUrlPath(filePath: string): string {
  const rel = relative(APP_DIR, filePath).split(sep);
  rel.pop(); // retire route.ts / page.tsx
  const segments = rel.filter((seg) => !(seg.startsWith("(") && seg.endsWith(")"))); // groupes de routes
  const url = "/" + segments.join("/");
  return url === "/" ? "/" : url.replace(/\/$/, "");
}

describe("exhaustivité des routes — spec 038", () => {
  const files = walk(APP_DIR);
  const urls = files.map((f) => ({ file: relative(join(__dirname, "../../.."), f), url: toUrlPath(f) }));

  it("a bien trouvé des routes à vérifier (le test n'est pas vide)", () => {
    expect(urls.length).toBeGreaterThan(150);
  });

  it.each(urls)("$url ($file) est revendiqué par un module ou le noyau", ({ url }) => {
    const owner = fullRouteTable.resolve(url);
    expect(owner.kind, `"${url}" n'est revendiqué par aucun manifeste ni par NOYAU_ROUTES`).not.toBe(
      "orphan"
    );
  });

  it("aucune route n'est revendiquée par deux propriétaires distincts au même préfixe exact", () => {
    // Deux entrées de préfixe strictement identique (même chaîne) appartenant à des
    // modules différents seraient une déclaration ambiguë — la plus longue gagnerait de
    // façon non déterministe selon l'ordre d'insertion.
    const seen = new Map<string, string>();
    const allEntries = [
      ...(NOYAU_ROUTES.pages ?? []).map((p) => ({ prefix: p, owner: "noyau" })),
      ...(NOYAU_ROUTES.api ?? []).map((p) => ({ prefix: p, owner: "noyau" })),
      ...allManifests.flatMap((m) => [
        ...(m.routes?.authenticated ?? []).map((r) => ({ prefix: r.path, owner: m.name })),
        ...(m.routes?.api ?? []).map((r) => ({ prefix: r.path, owner: m.name })),
      ]),
    ];
    for (const { prefix, owner } of allEntries) {
      const existing = seen.get(prefix);
      if (existing && existing !== owner) {
        throw new Error(`Préfixe "${prefix}" déclaré par "${existing}" et "${owner}"`);
      }
      seen.set(prefix, owner);
    }
  });

  it("chaque préfixe déclaré par un manifeste correspond à au moins une route réelle", () => {
    const declaredPrefixes = allManifests.flatMap((m) => [
      ...(m.routes?.authenticated ?? []).map((r) => r.path),
      ...(m.routes?.api ?? []).map((r) => r.path),
    ]);
    const realUrls = urls.map((u) => u.url);
    for (const prefix of declaredPrefixes) {
      const matched = realUrls.some((u) => u === prefix || u.startsWith(`${prefix}/`));
      expect(matched, `Préfixe "${prefix}" déclaré mais aucune route réelle ne commence par lui`).toBe(
        true
      );
    }
  });
});
