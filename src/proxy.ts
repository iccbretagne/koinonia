import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { approvedSiteSlug, isForeignHost, refreshSiteHosts, siteSlugFromHost } from "@/lib/site-host";
import { resolveRouteOwner, isPublicRoute } from "@/lib/module-routes";
import { matchLegacyPath } from "@/lib/legacy-paths";
import { buildCsp, buildSiteCsp, cspHeaderName, generateNonce, storageOrigins, CSP_REPORT_PATH } from "@/lib/csp";

/**
 * Noms du cookie de session posé par Auth.js — variante non préfixée (HTTP,
 * développement) et variante `__Secure-` (HTTPS, production).
 *
 * Ces noms sont **supposés**, pas lus depuis la librairie : `defaultCookies()`
 * de `@auth/core` n'est pas exporté publiquement. Un renommage côté Auth.js
 * casserait donc ce middleware en silence — c'est le seul point du code où un
 * changement amont échapperait à la suite de tests. `proxy.test.ts` compare
 * cette constante à ce que la librairie installée définit réellement, pour que
 * la CI le signale au lieu de la production (issue #143).
 */
export const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

/**
 * Politique de sécurité du contenu (ADR-0022) posée sur les pages — pas sur l'API, qui ne
 * rend pas de HTML. Le nonce est aussi transmis dans l'en-tête de la **requête** : c'est là que
 * Next.js le lit pour l'apposer sur ses propres scripts (et `headers()` pour le layout racine).
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  refreshSiteHosts();
  const siteSlug = siteSlugFromHost(host, process.env.SITE_BASE_DOMAIN) ?? approvedSiteSlug(host);
  // Domaine dédié (ADR-0031) : site approuvé, sinon 404 — jamais l'application sur un hôte étranger.
  if (siteSlug || isForeignHost(host, process.env.SITE_BASE_DOMAIN)) return siteHostRoute(request, siteSlug);

  const pathname = request.nextUrl.pathname;
  // Fichiers statiques (`public/`) : jamais interceptés, comme avant l'élargissement du matcher.
  if (/\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();
  // Le site d'un événement n'est servi que par son hôte (ADR-0031) ; l'aperçu passe par l'onglet Site.
  if (pathname === "/site" || pathname.startsWith("/site/")) return notFoundResponse(pathname);
  if (pathname.startsWith("/api/")) return route(request);
  const legacy = legacyRedirect(request);
  if (legacy) return legacy;

  const headerName = cspHeaderName();
  const policy = buildCsp({
    nonce: generateNonce(),
    isDev: process.env.NODE_ENV === "development",
    storage: storageOrigins(),
  });
  const forwarded = new Headers(request.headers);
  forwarded.set(headerName, policy);

  const response = route(request, forwarded);
  response.headers.set(headerName, policy);
  return response;
}

function notFoundResponse(pathname: string): NextResponse {
  return pathname.startsWith("/api/") ? NextResponse.json({ error: "Not found" }, { status: 404 }) : new NextResponse("Not found", { status: 404 });
}

/**
 * Ancienne adresse d'écran (spec 092, lot 4) : redirection **temporaire** (307) vers la nouvelle,
 * requête conservée, depuis la table fixe de `legacy-paths.ts`. `GET`/`HEAD` seulement — un
 * `POST` vers une ancienne adresse n'est pas rejoué ailleurs (404 comme toute adresse inconnue).
 * Même origine par construction : seul le `pathname` d'une copie de l'URL change. Une cible d'un
 * module désactivé répond 404 à l'ancienne adresse, sans révéler la nouvelle. Placée avant le
 * contrôle de session : sans session, la nouvelle adresse renvoie ensuite vers la connexion.
 */
function legacyRedirect(request: NextRequest): NextResponse | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const match = matchLegacyPath(request.nextUrl.pathname);
  if (!match) return null;
  // Module coupé : pas de redirection ; l'ancienne adresse, revendiquée par aucun manifeste, suit
  // le chemin ordinaire et répond le même 404 (`/module-absent`) que la nouvelle.
  if (resolveRouteOwner(match.pathname).kind === "orphan") return null;
  const url = request.nextUrl.clone();
  url.pathname = match.pathname;
  if (match.query) {
    for (const [key, value] of new URLSearchParams(match.query)) url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url, 307);
  // Jamais mise en cache (navigateur, service worker, intermédiaires) : la table est temporaire.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Chemins qu'un hôte de site laisse passer tels quels (liste blanche, ADR-0031). */
const SITE_HOST_PASSTHROUGH = ["/inscription", "/reservation", "/billet", "/api/ticketing/public", "/_next"] as const;
const underPrefix = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
/** Page du site : un seul segment, sans point (les fichiers n'existent pas sur un hôte de site). */
const SITE_PAGE = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Hôte de site d'événement (spec 084, ADR-0031) : liste blanche stricte, tout le reste répond 404
 * — jamais d'accès à l'application, à ses API ni à Auth.js depuis cet hôte. Aucun cookie n'est lu
 * (pas de session) et le cookie éventuel est retiré de la requête transmise.
 */
function siteHostRoute(request: NextRequest, siteSlug: string | null): NextResponse {
  const pathname = request.nextUrl.pathname;
  const forwarded = new Headers(request.headers);
  forwarded.delete("cookie");

  const passthrough = pathname === "/favicon.ico" || SITE_HOST_PASSTHROUGH.some((p) => underPrefix(pathname, p));
  const page = pathname === "/" || SITE_PAGE.test(pathname);
  if (!passthrough && !(page && siteSlug)) return notFoundResponse(pathname);
  // Module de la billetterie désactivé : l'hôte de site ne sert rien non plus.
  if (!underPrefix(pathname, "/_next") && resolveRouteOwner(passthrough ? pathname : "/site").kind === "orphan") return notFoundResponse(pathname);

  if (!pathname.startsWith("/api/") && !pathname.startsWith("/_next")) {
    const headerName = cspHeaderName();
    const policy = buildSiteCsp({
      nonce: generateNonce(),
      isDev: process.env.NODE_ENV === "development",
      turnstile: underPrefix(pathname, "/inscription"),
    });
    forwarded.set(headerName, policy);
    const response = passthrough
      ? NextResponse.next({ request: { headers: forwarded } })
      : NextResponse.rewrite(new URL(`/site/${siteSlug}${pathname === "/" ? "" : pathname}`, request.url), { request: { headers: forwarded } });
    response.headers.set(headerName, policy);
    return response;
  }
  return NextResponse.next({ request: { headers: forwarded } });
}

/** Adresses joignables sans session ; toutes les autres exigent d'être connecté. */
function isOpenWithoutSession(pathname: string, method: string): boolean {
  return (
    // Le cron est authentifié par jeton porteur dans le route handler, pas par session
    // — ce n'est pas une adresse de module (NOYAU_ROUTES), donc pas déclarable via
    // `routes.public` d'un manifeste.
    pathname.startsWith("/api/cron") ||
    // Fournisseur Traefik et liste des domaines du proxy : boucle locale + jeton, vérifiés dans le handler.
    pathname.startsWith("/api/internal/") ||
    // Rapports de violation CSP : envoyés par le navigateur, session ou non (ADR-0022).
    pathname === CSP_REPORT_PATH ||
    // NextAuth gère sa propre poignée de main (signin, callback, csrf, session) : ces
    // endpoints DOIVENT rester joignables sans session. Le matcher élargi de spec 038
    // les fait désormais traverser le proxy (avant : exclus par `/api/((?!auth).*)`).
    pathname.startsWith("/api/auth") ||
    // La page de connexion se rend elle-même sans session (formulaire de connexion) —
    // la rediriger vers elle-même serait une boucle. Même raisonnement pour le matcher
    // élargi : "/" n'était pas intercepté avant spec 038.
    pathname === "/" ||
    // Adresses publiques par jeton d'un module actif (partage média, écoute audio,
    // formulaire agenda/intégration…) — dérivées de `routes.public` des manifestes,
    // plus de liste blanche codée en dur ici (spec 038).
    isPublicRoute(pathname, method)
  );
}

function route(request: NextRequest, forwarded?: Headers): NextResponse {
  const pathname = request.nextUrl.pathname;
  const next = () => (forwarded ? NextResponse.next({ request: { headers: forwarded } }) : NextResponse.next());

  // ─── Contrôle de module (spec 038) ─────────────────────────────────────────
  //
  // S'exécute AVANT toute notion d'identité — avant même de lire le cookie de session.
  // C'est ce placement qui ferme d'un seul geste le contournement Super Admin (une
  // dizaine d'emplacements dans src/lib/auth.ts et src/modules/*/auth.ts), les replis
  // sur l'appartenance à un département (isCaptureTeamMember, isIntegrationMember), et
  // les modules qui ne déclarent aucune permission (integration) : aucune de ces gardes
  // n'a besoin d'être modifiée, elles ne sont simplement jamais atteintes.
  //
  // `resolveRouteOwner` cherche le propriétaire parmi tous les manifestes puis vérifie qu'il
  // est actif (ENABLED_MODULES, amendement d'ADR-0012) — une adresse d'un module désactivé,
  // même placée sous le préfixe d'un module actif ou du noyau, résout donc "orphan" au même titre qu'une adresse
  // jamais revendiquée par personne. Les deux cas reçoivent la même réponse
  // "introuvable" : c'est le comportement voulu, une adresse réellement orpheline (bug)
  // est interceptée en amont par le test d'exhaustivité (CI), jamais en production.
  const owner = resolveRouteOwner(pathname);
  if (owner.kind === "orphan") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Réécriture interne : préserve l'URL affichée, /module-absent appelle notFound()
    // pour produire un vrai statut 404 avec l'habillage de l'application.
    return NextResponse.rewrite(
      new URL("/module-absent", request.url),
      forwarded ? { request: { headers: forwarded } } : undefined
    );
  }

  const sessionToken = SESSION_COOKIE_NAMES.map(
    (name) => request.cookies.get(name)?.value
  ).some(Boolean);

  if (!sessionToken) {
    if (isOpenWithoutSession(pathname, request.method)) return next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return next();
}

export const config = {
  // Toute page authentifiée doit traverser le proxy pour que le contrôle de module
  // s'applique — un matcher trop étroit laisserait joignables les pages des modules non
  // couverts (spec 038). Exclusions : assets Next.js. Les fichiers statiques (avec extension) traversent le proxy pour que
  // les hôtes de site les refusent (ADR-0031) ; sur l'hôte de l'application ils sont relayés tels quels.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
