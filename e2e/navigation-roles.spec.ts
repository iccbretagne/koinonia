import type { Page } from "@playwright/test";
import { expect, test } from "./roles";

/**
 * Navigation par rôle : espaces visibles (sidebar desktop, barre du bas + panneau « Plus »
 * mobile). Table de données volontairement petite, à mettre à jour avec src/lib/navigation.ts
 * (spec 092 : onze espaces au lot 1, barre du bas par rôle principal au lot 2). Constat du comportement, pas une prescription : en cas d'écart
 * légitime, corriger la table.
 */

const SPACES = [
  "Accueil",
  "Planning",
  "Événements",
  "Pastoral",
  "Personnes",
  "Demandes",
  "Finances",
  "Médias",
  "Ressources",
  "Administration",
  "Plateforme",
] as const;
type Space = (typeof SPACES)[number];

interface RoleNav {
  /** Espaces attendus (desktop et panneau « Plus ») ; tous les autres doivent être absents. */
  spaces: Space[];
  /** Libellés de la barre du bas mobile (hors « Plus »). */
  bottom: string[];
}

const SUPER_ADMIN: Space[] = ["Accueil", "Planning", "Événements", "Pastoral", "Personnes", "Demandes", "Finances", "Médias", "Ressources", "Administration", "Plateforme"];
const ADMIN: Space[] = SUPER_ADMIN.filter((s) => s !== "Plateforme");
const MINISTRE: Space[] = ["Accueil", "Planning", "Événements", "Personnes", "Demandes", "Médias", "Ressources", "Administration"];
const DEPT_HEAD: Space[] = ["Accueil", "Planning", "Événements", "Personnes", "Demandes", "Médias", "Ressources"];

export const NAV_BY_ROLE: Record<string, RoleNav> = {
  "super-admin": { spaces: SUPER_ADMIN, bottom: ["Accueil", "Événements", "Personnes", "Planning"] },
  admin: { spaces: ADMIN, bottom: ["Accueil", "Événements", "Personnes", "Planning"] },
  secretaire: { spaces: ADMIN, bottom: ["Accueil", "Traitement", "Événements", "Personnes"] },
  ministre: { spaces: MINISTRE, bottom: ["Accueil", "Planning", "Événements", "Personnes"] },
  "resp-accueil": { spaces: DEPT_HEAD, bottom: ["Accueil", "Planning", "Événements", "Personnes"] },
  "resp-secretariat": { spaces: DEPT_HEAD, bottom: ["Accueil", "Planning", "Événements", "Personnes"] },
  "faiseur-disciples": { spaces: ["Accueil", "Planning", "Personnes", "Médias", "Ressources"], bottom: ["Accueil", "Discipolat", "Planning"] },
  reporter: { spaces: ["Accueil", "Événements", "Médias", "Ressources"], bottom: ["Accueil", "Comptes rendus", "Calendrier"] },
  star: { spaces: DEPT_HEAD.filter((s) => s !== "Personnes"), bottom: ["Accueil", "Mon planning", "Calendrier"] },
  comptable: { spaces: ["Accueil", "Finances", "Médias", "Ressources"], bottom: ["Accueil", "Demandes", "Trésorerie"] },
  "referent-soins": { spaces: ["Accueil", "Pastoral", "Médias", "Ressources"], bottom: ["Accueil", "Suivi"] },
};

/** Lignes de navigation visibles sous forme de texte (le texte inclut pastilles et « (nouvel onglet) »). */
async function texts(scope: ReturnType<Page["locator"]>) {
  return scope.locator("a, button").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
}

/** Un espace est présent si une ligne commence par son libellé (les suffixes sont des compteurs). */
function presentSpaces(items: string[]): Space[] {
  return SPACES.filter((s) => items.some((t) => t.startsWith(s)));
}

for (const [role, nav] of Object.entries(NAV_BY_ROLE)) {
  test(`navigation ${role}`, async ({ asRole }, info) => {
    const page = await asRole(role);
    await page.goto("/accueil");

    if (info.project.name === "desktop") {
      const sidebar = page.getByRole("navigation", { name: "Navigation principale" }).first();
      await expect(sidebar.getByRole("link", { name: "Accueil" })).toHaveAttribute("href", "/accueil");
      await expect.poll(async () => presentSpaces(await texts(sidebar))).toEqual(nav.spaces);
    } else {
      const bottom = page.getByRole("navigation", { name: "Navigation rapide" });
      await expect(bottom).toBeVisible();
      const labels = (await texts(bottom)).filter((t) => !t.startsWith("Plus"));
      expect(labels).toEqual(nav.bottom);

      await bottom.getByRole("button", { name: /^Plus/ }).click();
      const sheet = page.getByRole("dialog", { name: "Menu" });
      await expect(sheet).toBeVisible();
      expect(presentSpaces(await texts(sheet))).toEqual(nav.spaces);
      // Toujours présents dans le panneau, quel que soit le rôle.
      await expect(sheet.getByRole("link", { name: "Mon profil" })).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Guide d'utilisation" })).toBeVisible();
    }
  });
}

// Pages clés : accessibles (pas de « Accès refusé ») pour le rôle, lecture seule.
const KEY_PAGES: Record<string, string[]> = {
  admin: ["/admin/events", "/admin/members", "/events"],
  secretaire: ["/admin/events", "/admin/members"],
  star: ["/planning", "/profile/notifications"],
  comptable: ["/dons"],
  reporter: ["/admin/reports"],
};

for (const [role, urls] of Object.entries(KEY_PAGES)) {
  test(`pages clés ${role}`, async ({ asRole }, info) => {
    test.skip(info.project.name !== "desktop", "même contrôle serveur sur mobile");
    const page = await asRole(role);
    for (const url of urls) {
      const res = await page.goto(url);
      expect(res?.status(), url).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }).first(), url).not.toHaveText(/Accès refusé|Page introuvable/);
    }
  });
}
