import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clearAuthCookies } from "@/lib/auth-cookies";

/**
 * Réinitialisation de l'état d'authentification du navigateur (issue #505).
 *
 * Supprime tous les cookies Auth.js puis renvoie sur la page de connexion.
 * Remplace la purge manuelle des données du site, que l'on ne peut pas
 * raisonnablement demander à un utilisateur final.
 *
 * Volontairement **non authentifiée** : elle sert précisément aux cas où la
 * session est cassée. Elle n'expose aucune donnée et ne peut que déconnecter
 * l'appelant — un tiers qui parviendrait à la déclencher ne gagne rien qu'un
 * bouton « Se déconnecter » ne donnerait déjà.
 *
 * Située sous `/api/auth/*`, elle est hors du matcher de `src/proxy.ts`.
 */
export async function GET(request: NextRequest) {
  // Location **relative** (RFC 7231 §7.1.2) et non `new URL("/", request.url)` :
  // derrière Traefik, `request.url` porte l'adresse interne du service
  // (`https://0.0.0.0:3001`), que le navigateur ne peut pas joindre. Constaté en
  // recette, invisible en test unitaire — la redirection est le cœur du
  // correctif #505, elle doit atterrir sur le domaine public.
  const response = new NextResponse(null, {
    status: 307,
    headers: { location: "/" },
  });
  clearAuthCookies(request.cookies, response.cookies);
  // Un intermédiaire ne doit pas servir cette redirection en cache : elle ne
  // vaut que pour la requête qui porte les cookies à supprimer.
  response.headers.set("Cache-Control", "no-store");
  return response;
}
