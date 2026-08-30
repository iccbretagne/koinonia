import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
  const sessionToken = SESSION_COOKIE_NAMES.map(
    (name) => request.cookies.get(name)?.value
  ).find(Boolean);

  if (!sessionToken) {
    // Allow cron routes to pass through (authenticated by bearer token in route handler)
    if (request.nextUrl.pathname.startsWith("/api/cron")) {
      return NextResponse.next();
    }
    // Allow public media token routes (validate, gallery, download, collection — token-based auth)
    if (request.nextUrl.pathname.startsWith("/api/media/validate/") ||
        request.nextUrl.pathname.startsWith("/api/media/gallery/") ||
        request.nextUrl.pathname.startsWith("/api/media/download/") ||
        request.nextUrl.pathname.startsWith("/api/media/collection/")) {
      return NextResponse.next();
    }
    // Allow public audio share-link routes (/ecouter/[token]) — token-based auth, pas de
    // session requise (le lien est aussi destiné à des personnes sans compte Koinonia).
    if (request.nextUrl.pathname.startsWith("/api/audio/public/")) {
      return NextResponse.next();
    }
    // Allow public agenda request form (Turnstile-protected, no session required)
    if (request.nextUrl.pathname === "/api/agenda/requests/public") {
      return NextResponse.next();
    }
    // Allow public "rejoindre" form (page /rejoindre/[churchSlug], hors session)
    if (
      (request.nextUrl.pathname === "/api/integration/requests" && request.method === "POST") ||
      request.nextUrl.pathname === "/api/integration/families/suggest"
    ) {
      return NextResponse.next();
    }
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/((?!auth).*)"],
};
