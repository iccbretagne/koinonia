/**
 * Verification Cloudflare Turnstile — preuve d'humanite sur le formulaire public de demande
 * de RDV (`/agenda-public`).
 *
 * Desactivee sur le formulaire d'integration famille (`/rejoindre`) : la dependance a
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (inlinee au build, pas au runtime) rendait ce formulaire
 * indisponible en production faute d'etre passee au pipeline de build — voir
 * specs/030-captcha-formulaire-integration/. Ce formulaire reste protege par le rate-limit
 * IP de `POST /api/integration/requests`.
 *
 * FAIL-CLOSED VOLONTAIRE : sans `TURNSTILE_SECRET_KEY`, la fonction retourne `false`, donc
 * toute soumission est refusee. Ce n'est pas un oubli : un repli permissif serait un
 * interrupteur silencieux desactivant la protection selon la configuration. Consequence a
 * connaitre — un environnement sans cette variable rend `/agenda-public` inutilisable.
 */
export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
