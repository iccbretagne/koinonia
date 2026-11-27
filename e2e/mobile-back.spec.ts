import { expect, test } from "./roles";

// Mobile : une page de détail affiche le chevron « Retour à <parent> » dans la barre du haut ;
// une page de navigation affiche à la place l'identité de l'église.
const CHURCH = "ICC Kervignac";

const DETAIL_PAGES: { url: string; parent: string }[] = [
  { url: "/requests/new", parent: "Mes demandes" },
  { url: "/profile", parent: "Accueil" },
  { url: "/profile/notifications", parent: "Mon profil" },
  { url: "/guide", parent: "Accueil" },
];

const NAV_PAGES = ["/accueil", "/admin/members", "/events", "/requests"];

test.describe("retour mobile", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "mobile", "barre du haut mobile uniquement");
  });

  for (const { url, parent } of DETAIL_PAGES) {
    test(`${url} → Retour à ${parent}`, async ({ asRole }) => {
      const page = await asRole("admin");
      await page.goto(url);
      const back = page.locator("header").getByRole("link", { name: `Retour à ${parent}` });
      await expect(back).toBeVisible();
      await expect(page.locator("header").getByText(CHURCH)).toHaveCount(0);
    });
  }

  for (const url of NAV_PAGES) {
    test(`${url} affiche l'église, sans retour`, async ({ asRole }) => {
      const page = await asRole("admin");
      await page.goto(url);
      await expect(page.locator("header").getByText(CHURCH).first()).toBeVisible();
      await expect(page.locator("header").getByRole("link", { name: /^Retour à/ })).toHaveCount(0);
    });
  }
});
