import { expect, test } from "./roles";

// Un STAR qui ouvre directement une URL d'administration reçoit un vrai HTTP 403 (garde
// d'adresse de `src/app/(auth)/page-gates.ts`) et la page d'erreur commune
// (`ForbiddenNotice`), à l'emplacement de l'URL : pas de redirection, pas de 404, aucun
// contenu de la page refusée.
const ADMIN_URLS = ["/personnes/star", "/admin/users", "/evenements/gestion", "/admin/access", "/admin/audit-logs", "/planning/departements", "/ressources/salles"];

for (const url of ADMIN_URLS) {
  test(`STAR refusé sur ${url}`, async ({ asRole }) => {
    const page = await asRole("star");
    const res = await page.goto(url);
    expect(res?.status()).toBe(403);
    expect(new URL(page.url()).pathname).toBe(url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accès refusé");
    await expect(page.getByText("Votre rôle dans cette église ne donne pas accès à cette page.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Revenir à l'accueil" })).toHaveAttribute("href", "/");
  });
}
