/**
 * Nettoyage des cookies posés par Auth.js (issue #505).
 *
 * Koinonia utilise la stratégie de session **base de données** : le cookie de
 * session ne porte qu'un identifiant opaque pointant vers une ligne `Session`.
 * Cookie et session peuvent donc diverger — expiration de la ligne, base
 * réinitialisée, session purgée — et Auth.js ne supprime jamais un cookie dont
 * il ne retrouve pas la session : il ne le fait que sur un `signOut()` explicite.
 * De même, un callback OAuth qui échoue laisse derrière lui ses cookies de
 * contrôle (`state`, PKCE, CSRF), qui font échouer la tentative suivante.
 *
 * Dans les deux cas l'utilisateur reste bloqué jusqu'à ce qu'il purge les
 * données du site dans son navigateur — opération non triviale. Ce module
 * fournit ce nettoyage côté serveur pour qu'il n'ait jamais à le faire.
 */

/**
 * Reconnaît un cookie Auth.js : nom de base `authjs.*`, éventuellement préfixé
 * par `__Secure-` (HTTPS) ou `__Host-` (cookie de CSRF en HTTPS).
 *
 * Volontairement large plutôt qu'une liste de noms exacts : on veut aussi
 * balayer les cookies de contrôle OAuth (`authjs.state`,
 * `authjs.pkce.code_verifier`, `authjs.nonce`, `authjs.callback-url`), et un
 * nom ajouté par une future version d'Auth.js doit être nettoyé lui aussi.
 */
const AUTH_COOKIE_PATTERN = /^(?:__Secure-|__Host-)?authjs\./;

export function isAuthCookieName(name: string): boolean {
  return AUTH_COOKIE_PATTERN.test(name);
}

interface CookieReader {
  getAll(): { name: string }[];
}

interface CookieWriter {
  set(name: string, value: string, options: Record<string, unknown>): unknown;
}

/**
 * Expire tous les cookies Auth.js présents sur la requête.
 *
 * Les cookies préfixés `__Secure-`/`__Host-` ne peuvent être écrasés que si
 * l'attribut `Secure` est repositionné — sinon le navigateur ignore la
 * suppression et l'utilisateur reste bloqué. Auth.js pose tous ces cookies sur
 * `path=/`, on les supprime donc sur le même chemin.
 *
 * @returns les noms effectivement expirés (vide si rien à nettoyer).
 */
export function clearAuthCookies(
  requestCookies: CookieReader,
  responseCookies: CookieWriter
): string[] {
  const names = requestCookies
    .getAll()
    .map((c) => c.name)
    .filter(isAuthCookieName);

  for (const name of names) {
    responseCookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-") || name.startsWith("__Host-"),
    });
  }

  return names;
}
