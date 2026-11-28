import { expect, test } from "./roles";

/**
 * Lecture pastorale (spec 092, lot 3) avec le compte « pasteur » : aucun rôle d'église, un
 * profil pastoral lié dans Kervignac (`pastoralChurchIds`), comme un vrai pasteur. Il lit un
 * compte rendu et une demande comptable sans pouvoir agir, et n'ouvre pas un écran de gestion.
 */
test.describe("lecture pastorale", () => {
  test.skip(({ isMobile }) => isMobile, "mêmes contrôles serveur sur mobile");

  test("compte rendu en lecture seule, sans export", async ({ asRole }) => {
    const page = await asRole("pasteur");
    const res = await page.goto("/evenements/comptes-rendus");
    expect(res?.status()).toBe(200);
    // Pas d'export Excel (réservé aux comptes rendus en saisie).
    await expect(page.getByLabel("Du", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Exporter/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Saisir le compte rendu" })).toHaveCount(0);

    const open = page.getByRole("link", { name: "Ouvrir le compte rendu" }).first();
    await expect(open).toBeVisible();
    await open.click();
    await expect(page).toHaveURL(/\/evenements\/comptes-rendus\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compte rendu");
    // Vue lecture : aucun bouton d'action dans le contenu, aucun champ de saisie.
    const main = page.locator("main");
    await expect(main.getByRole("button")).toHaveCount(0);
    await expect(main.getByRole("textbox")).toHaveCount(0);
  });

  test("demande comptable en lecture seule, pièces non ouvrables", async ({ asRole }) => {
    const page = await asRole("pasteur");
    const res = await page.goto("/finances/demandes");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("link", { name: "Nouvelle demande" })).toHaveCount(0);

    const link = page.locator('main a[href^="/finances/demandes/"]:not([href$="/nouvelle"]):visible').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/finances\/demandes\/[^/]+$/);
    const main = page.locator("main");
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
    // Ni validation, ni rejet, ni remise, ni archivage, ni pièce ouvrable ou téléchargeable.
    for (const name of [/Valider/, /Rejeter/, /Archiver/, /Demander une pièce/, /^Voir /, /^Télécharger /, /^Supprimer /, /Exporter/]) {
      await expect(main.getByRole("button", { name })).toHaveCount(0);
    }
    await expect(main.locator('input[type="file"]')).toHaveCount(0);
  });

  test("écran de gestion : 403", async ({ asRole }) => {
    const page = await asRole("pasteur");
    for (const url of ["/admin/users", "/evenements/gestion", "/finances/tresorerie"]) {
      const res = await page.goto(url);
      expect(res?.status(), url).toBe(403);
      await expect(page.getByRole("heading", { level: 1 }), url).toHaveText("Accès refusé");
    }
  });
});
