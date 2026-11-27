import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, ROLE_KEYS, test } from "./roles";

/**
 * Accessibilité (axe, WCAG 2 A + AA) sur /accueil pour chaque rôle, dans les deux viewports,
 * puis avec le panneau « Plus » (mobile) et la palette de recherche ouverts.
 *
 * Les violations déjà présentes ne sont PAS corrigées ici : elles sont listées dans
 * KNOWN_VIOLATIONS (règle axe par scénario) et rapportées. Un scénario connu est ignoré
 * règle par règle ; toute autre violation fait échouer le test, et une violation connue qui
 * disparaît le fait échouer aussi (retirer alors l'entrée).
 */
const KNOWN_VIOLATIONS: Record<string, string[]> = {
  // "<projet>/<rôle>/<page>": ["règle-axe", …] — vide au premier passage (0 violation A/AA).
};

async function scan(page: Page, key: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const known = KNOWN_VIOLATIONS[key] ?? [];
  const found = violations.map((v) => v.id);
  const unexpected = violations.filter((v) => !known.includes(v.id));
  expect(
    unexpected.map((v) => `${v.id} (${v.impact}) : ${v.nodes.length} élément(s), ex. ${v.nodes[0]?.target.join(" ")}`),
    `violations axe inattendues — ${key}`,
  ).toEqual([]);
  const fixed = known.filter((id) => !found.includes(id));
  expect(fixed, `violations connues disparues — ${key} : retirer de KNOWN_VIOLATIONS`).toEqual([]);
}

for (const role of ROLE_KEYS) {
  test(`a11y /accueil ${role}`, async ({ asRole }, info) => {
    const page = await asRole(role);
    await page.goto("/accueil");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, `${info.project.name}/${role}/accueil`);
  });
}

test("a11y panneau « Plus » ouvert (mobile)", async ({ asRole }, info) => {
  test.skip(info.project.name !== "mobile");
  const page = await asRole("admin");
  await page.goto("/accueil");
  await page.getByRole("navigation", { name: "Navigation rapide" }).getByRole("button", { name: /^Plus/ }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  await scan(page, "mobile/admin/plus");
});

test("a11y palette de recherche ouverte", async ({ asRole }, info) => {
  const page = await asRole("admin");
  await page.goto("/accueil");
  const opener =
    info.project.name === "mobile"
      ? page.getByRole("button", { name: "Rechercher", exact: true })
      : page.getByRole("button", { name: /Rechercher/ }).first();
  await opener.click();
  await expect(page.getByRole("combobox", { name: /Rechercher une page/ })).toBeVisible();
  await scan(page, `${info.project.name}/admin/palette`);
});
