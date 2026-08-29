/**
 * Verification Cloudflare Turnstile — preuve d'humanite sur les formulaires publics
 * (demande de RDV `/agenda-public`, integration `/rejoindre`).
 *
 * Mutualisee ici plutot que dupliquee par route : c'est un controle de securite, et deux
 * copies finissent par diverger le jour ou le fournisseur, l'URL de verification ou le
 * traitement d'erreur change — en laissant une route en arriere sans que personne le voie.
 *
 * FAIL-CLOSED VOLONTAIRE : sans `TURNSTILE_SECRET_KEY`, la fonction retourne `false`, donc
 * toute soumission est refusee. Ce n'est pas un oubli : un repli permissif serait un
 * interrupteur silencieux desactivant la protection selon la configuration. Consequence a
 * connaitre — un environnement sans cette variable rend les formulaires publics
 * inutilisables (voir specs/030-captcha-formulaire-integration/).
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
