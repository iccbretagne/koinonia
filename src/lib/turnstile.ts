import { logger } from "@/lib/logger";

/**
 * Verification Cloudflare Turnstile — preuve d'humanite sur les formulaires publics
 * (`/agenda-public`, `/rejoindre`, spec 030).
 *
 * CLÉS LUES AU RUNTIME : la clé publique (`TURNSTILE_SITE_KEY`) est lue par le serveur à chaque
 * requête et passée en prop au widget, comme la clé secrète — jamais inlinée au build. Une
 * variable `NEXT_PUBLIC_*` est figée dans l'artefact par `next build` : construit en CI sans
 * elle, l'artefact déployé ne portait aucune clé, le widget ne s'affichait pas et toute
 * soumission restait bloquée (incident v1.21.1 sur `/rejoindre`, puis `/agenda-public`).
 *
 * FAIL-CLOSED VOLONTAIRE : sans `TURNSTILE_SECRET_KEY`, `verifyTurnstile` retourne `false`, donc
 * toute soumission est refusee. Ce n'est pas un oubli : un repli permissif serait un
 * interrupteur silencieux desactivant la protection selon la configuration. En contrepartie,
 * `getTurnstileSiteKey` permet aux pages d'annoncer clairement un formulaire indisponible au
 * lieu d'un CAPTCHA invisible.
 */

/**
 * Ancien nom de la clé publique, encore accepté au runtime pour ne pas casser un `shared/.env`
 * qui la renseigne déjà. Lu par clé calculée : `process.env.NEXT_PUBLIC_…` écrit en toutes
 * lettres serait remplacé par sa valeur (vide) au build.
 */
const LEGACY_SITE_KEY_VAR = ["NEXT", "PUBLIC", "TURNSTILE", "SITE", "KEY"].join("_");

/**
 * Valeur d'une clé Turnstile nettoyée. `EnvironmentFile` (systemd) ne retire pas un commentaire
 * en fin de ligne : `TURNSTILE_SITE_KEY=0x4AAA…  # clé publique` donnait la clé suivie du
 * commentaire, refusée par Cloudflare (incident v1.26.2). Une clé ne contient ni espace ni `#` :
 * on retire le commentaire puis on n'en garde que le premier mot.
 */
function readKey(name: string): string {
  return (process.env[name] ?? "").replace(/(^|\s)#.*$/, "").trim().split(/\s/)[0];
}

/**
 * Clé publique Turnstile si le formulaire public peut fonctionner (clé publique ET clé secrète
 * configurées), sinon `null` — la page affiche alors « formulaire indisponible ». À appeler
 * pendant un rendu dynamique (`await connection()`) pour lire l'environnement du serveur.
 */
export function getTurnstileSiteKey(): string | null {
  const siteKey = readKey("TURNSTILE_SITE_KEY") || readKey(LEGACY_SITE_KEY_VAR);
  const hasSecret = !!readKey("TURNSTILE_SECRET_KEY");
  if (siteKey && hasSecret) return siteKey;
  logger.error(
    { hasSiteKey: !!siteKey, hasSecret },
    "Turnstile non configuré (TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY) : formulaires publics indisponibles",
  );
  return null;
}

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = readKey("TURNSTILE_SECRET_KEY");
  if (!secret) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
