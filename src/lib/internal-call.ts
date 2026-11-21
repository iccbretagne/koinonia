import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors";

/**
 * Appels internes de la machine elle-même (fournisseur HTTP de Traefik, liste des domaines du
 * proxy). Deux verrous cumulés : la requête arrive en boucle locale **et** porte le jeton porteur
 * `TRAEFIK_PROVIDER_TOKEN`.
 *
 * Boucle locale : l'application ne voit pas l'adresse du client ; on l'établit par ce qui ne peut
 * pas venir d'Internet. Une requête relayée par Traefik porte toujours `X-Forwarded-*` et l'hôte
 * public ; un appel direct à `127.0.0.1` n'en porte aucun et a pour hôte `127.0.0.1`/`localhost`.
 * Ne jamais configurer Traefik pour retirer ces en-têtes.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const FORWARDING_HEADERS = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "forwarded"] as const;

export function isLoopbackRequest(headers: Headers): boolean {
  const host = (headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  return LOOPBACK_HOSTS.has(host) && FORWARDING_HEADERS.every((h) => !headers.has(h));
}

/** Comparaison à temps constant (empreintes de même longueur). */
function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/** Jette 404 sans jeton configuré, 403 sinon si la requête n'est pas locale ou si le jeton diffère. */
export function requireInternalCall(request: Request): void {
  const token = process.env.TRAEFIK_PROVIDER_TOKEN;
  if (!token) throw new ApiError(404, "Not found");
  const given = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!isLoopbackRequest(request.headers) || !sameSecret(given, token)) throw new ApiError(403, "Forbidden");
}
