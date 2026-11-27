import { expect, test } from "./roles";

// Comportement actuel (à mettre à jour si l'application change) : un STAR qui ouvre
// directement une URL d'administration reçoit HTTP 200 sur une page « Accès refusé » rendue
// à l'emplacement de l'URL (pas de redirection, pas de 403/404), sans contenu de la page.
const ADMIN_URLS = ["/personnes/star", "/admin/users", "/evenements/gestion", "/admin/access", "/admin/audit-logs", "/planning/departements", "/ressources/salles"];

for (const url of ADMIN_URLS) {
  test(`STAR refusé sur ${url}`, async ({ asRole }) => {
    const page = await asRole("star");
    const res = await page.goto(url);
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accès refusé");
  });
}
