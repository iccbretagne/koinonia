import type { ModuleManifest, ModuleRoutes } from "./module-registry";

/**
 * Résolution « quelle adresse appartient à quel module ».
 *
 * Algorithme pur — aucun import de module, de Next.js ou de Prisma (règle
 * `core-no-modules-import`). Construit une table de préfixes à partir d'une liste de
 * manifestes (dont seul le champ `routes` est lu) et d'une liste noyau explicite, puis
 * résout un chemin au **préfixe le plus long**.
 *
 * Utilisé par `src/lib/module-routes.ts` (composition, filtrée par les modules actifs)
 * et par le test d'exhaustivité (`src/lib/__tests__/routes-exhaustivite.test.ts`), qui
 * construit la table sur la base de **tous** les manifestes, actifs ou non — une route
 * doit être revendiquée indépendamment du réglage de déploiement.
 */

export type RouteOwnerKind = "module" | "noyau" | "orphan";

export interface RouteOwner {
  kind: RouteOwnerKind;
  /** Nom du module ou "noyau" propriétaire. `null` si `kind === "orphan"`. */
  owner: string | null;
  /** Le préfixe déclaré qui a matché (le plus long). `null` si orphelin. */
  matchedPrefix: string | null;
}

export interface NoyauRoutes {
  /** Pages authentifiées et non authentifiées du noyau (ex. "/", "/no-access"). */
  pages?: readonly string[];
  /** Préfixes API du noyau (ex. "/api/auth", "/api/health"). */
  api?: readonly string[];
}

interface PrefixEntry {
  prefix: string;
  owner: string;
  /** Un préfixe de `routes.public` ne requiert pas de session dans le proxy. */
  public: boolean;
  /** Restreint l'entrée publique à une méthode HTTP (voir `RouteDescriptor.method`). */
  method?: string;
}

export class RouteTable {
  private readonly entries: PrefixEntry[];

  constructor(manifests: readonly ModuleManifest[], noyau: NoyauRoutes) {
    const entries: PrefixEntry[] = [];

    for (const name of ["noyau"] as const) {
      for (const prefix of noyau.pages ?? []) entries.push({ prefix, owner: name, public: false });
      for (const prefix of noyau.api ?? []) entries.push({ prefix, owner: name, public: false });
    }

    for (const mod of manifests) {
      const routes: ModuleRoutes = mod.routes ?? {};
      for (const r of routes.authenticated ?? []) {
        entries.push({ prefix: r.path, owner: mod.name, public: false });
      }
      for (const r of routes.api ?? []) {
        entries.push({ prefix: r.path, owner: mod.name, public: false });
      }
      for (const r of routes.public ?? []) {
        entries.push({ prefix: r.path, owner: mod.name, public: true, method: r.method });
      }
    }

    // Le plus long préfixe d'abord — la résolution s'arrête au premier qui matche.
    entries.sort((a, b) => b.prefix.length - a.prefix.length);
    this.entries = entries;
  }

  /** Toutes les entrées déclarées, sans résolution — pour le test d'exhaustivité. */
  list(): readonly PrefixEntry[] {
    return this.entries;
  }

  resolve(pathname: string): RouteOwner {
    const normalized = normalizePath(pathname);
    for (const entry of this.entries) {
      if (matchesPrefix(normalized, entry.prefix)) {
        return {
          kind: entry.owner === "noyau" ? "noyau" : "module",
          owner: entry.owner,
          matchedPrefix: entry.prefix,
        };
      }
    }
    return { kind: "orphan", owner: null, matchedPrefix: null };
  }

  /**
   * `true` si le chemin (pour la méthode donnée) correspond à un préfixe déclaré
   * `public` — pas de session requise. Une entrée restreinte par `method` ne matche
   * que cette méthode (ex. `POST /api/integration/requests` est public, `GET` sur la
   * même adresse reste protégé).
   */
  isPublic(pathname: string, method: string): boolean {
    const normalized = normalizePath(pathname);
    for (const entry of this.entries) {
      if (!entry.public) continue;
      if (entry.method && entry.method !== method) continue;
      if (matchesPrefix(normalized, entry.prefix)) return true;
    }
    return false;
  }
}

function normalizePath(pathname: string): string {
  // Ignore la chaîne de requête et la barre finale (sauf racine).
  const withoutQuery = pathname.split("?")[0].split("#")[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true;
  // La racine "/" est un chemin exact, jamais un préfixe — sinon elle capturerait tout.
  if (prefix === "/") return false;
  // Un préfixe ne matche qu'à une frontière de segment : "/admin" ne doit pas capturer
  // "/administration".
  return pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}
