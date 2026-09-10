import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveRouteOwner, isPublicRoute } from "@/lib/module-routes";

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

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ─── Contrôle de module (spec 038) ─────────────────────────────────────────
  //
  // S'exécute AVANT toute notion d'identité — avant même de lire le cookie de session.
  // C'est ce placement qui ferme d'un seul geste le contournement Super Admin (une
  // dizaine d'emplacements dans src/lib/auth.ts et src/modules/*/auth.ts), les replis
  // sur l'appartenance à un département (isCaptureTeamMember, isIntegrationMember), et
  // les modules qui ne déclarent aucune permission (integration) : aucune de ces gardes
  // n'a besoin d'être modifiée, elles ne sont simplement jamais atteintes.
  //
  // `resolveRouteOwner` ne connaît que les modules **actifs** (ENABLED_MODULES) — une
  // adresse d'un module désactivé résout donc "orphan" au même titre qu'une adresse
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
    return NextResponse.rewrite(new URL("/module-absent", request.url));
  }

  const sessionToken = SESSION_COOKIE_NAMES.map(
    (name) => request.cookies.get(name)?.value
  ).find(Boolean);

  if (!sessionToken) {
    // Le cron est authentifié par jeton porteur dans le route handler, pas par session
    // — ce n'est pas une adresse de module (NOYAU_ROUTES), donc pas déclarable via
    // `routes.public` d'un manifeste.
    if (pathname.startsWith("/api/cron")) {
      return NextResponse.next();
    }
    // NextAuth gère sa propre poignée de main (signin, callback, csrf, session) : ces
    // endpoints DOIVENT rester joignables sans session. Le matcher élargi de spec 038
    // les fait désormais traverser le proxy (avant : exclus par `/api/((?!auth).*)`).
    if (pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }
    // La page de connexion se rend elle-même sans session (formulaire de connexion) —
    // la rediriger vers elle-même serait une boucle. Même raisonnement pour le matcher
    // élargi : "/" n'était pas intercepté avant spec 038.
    if (pathname === "/") {
      return NextResponse.next();
    }
    // Adresses publiques par jeton d'un module actif (partage média, écoute audio,
    // formulaire agenda/intégration…) — dérivées de `routes.public` des manifestes,
    // plus de liste blanche codée en dur ici (spec 038).
    if (isPublicRoute(pathname, request.method)) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Toute page authentifiée doit traverser le proxy pour que le contrôle de module
  // s'applique — un matcher trop étroit laisserait joignables les pages des modules non
  // couverts (spec 038). Exclusions : assets Next.js et fichiers statiques.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
