import { boot } from "@/core/boot";
import { RouteTable, type NoyauRoutes } from "@/core/module-routes";
import { allManifests } from "./manifests";

/**
 * Adresses qui n'appartiennent à aucun module — authentification, santé, tâches
 * planifiées (le cron reste joignable même si les traitements qu'il déclenche sont
 * conditionnés module par module, voir `src/app/api/cron/route.ts`), contexte d'église
 * courante, préférences utilisateur, et les trois pages qui ne supposent aucun module actif
 * (accueil, aucun accès, relais 404 de module absent).
 *
 * Liste volontairement courte : tout ce qui n'y figure pas doit être revendiqué par un
 * manifeste, sous peine d'échouer au test d'exhaustivité
 * (`src/lib/__tests__/routes-exhaustivite.test.ts`).
 */
export const NOYAU_ROUTES: NoyauRoutes = {
  // "/admin" (exact) est un simple redirecteur d'atterrissage vers /admin/churches ou
  // /admin/users selon les droits — il ne rend rien de propre à un module, donc noyau. Les
  // sous-sections (/admin/churches, /admin/departments, …) restent déclarées par leur module.
  pages: ["/", "/no-access", "/module-absent", "/admin"],
  api: ["/api/auth", "/api/health", "/api/current-church", "/api/user", "/api/cron"],
};

/**
 * Racine de composition **légère** pour la résolution de routes : construit un registry à
 * partir des manifestes seuls (pas des index de modules), donc sans jamais tirer Prisma,
 * NextAuth ou S3 — c'est ce qui permet à `src/proxy.ts` de l'importer directement (voir la
 * règle dependency-cruiser `proxy-only-module-routes`, et ADR-0011 sur la séparation
 * manifeste/index).
 *
 * Filtré par `ENABLED_MODULES` comme le registry applicatif (`@/lib/registry`), mais c'est
 * un objet **distinct** : les deux sont construits séparément à partir de la même source
 * (`allManifests`) pour ne jamais faire dépendre le proxy du registry applicatif.
 */
const activeRegistry = boot({ modules: [...allManifests] });

/** Table utilisée en production/dev — ne voit que les modules actifs. */
export const activeRouteTable = new RouteTable(activeRegistry.list(), NOYAU_ROUTES);

/**
 * Table de référence pour le test d'exhaustivité — voit **tous** les manifestes, actifs ou
 * non : une route doit être revendiquée indépendamment du réglage de déploiement.
 */
export const fullRouteTable = new RouteTable([...allManifests], NOYAU_ROUTES);

export function resolveRouteOwner(pathname: string) {
  return activeRouteTable.resolve(pathname);
}

/** `true` si le module propriétaire de `pathname` est actif (ou si c'est une adresse du noyau). */
export function isPathEnabled(pathname: string): boolean {
  const owner = activeRouteTable.resolve(pathname);
  return owner.kind !== "orphan";
}

export function isPublicRoute(pathname: string, method: string): boolean {
  return activeRouteTable.isPublic(pathname, method);
}
