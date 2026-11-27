import path from "node:path";
import { test as base, type Page } from "@playwright/test";
import { DEV_USERS } from "../prisma/fixtures/dev-users";

export const ROLE_KEYS: string[] = DEV_USERS.map((u) => u.key);
export type RoleKey = string;

export const authFile = (key: RoleKey) => path.join(__dirname, ".auth", `${key}.json`);

/** Masque l'indicateur de développement de Next, qui recouvre le bas de l'écran. */
async function hideDevOverlay(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.documentElement.appendChild(s);
    });
  });
}

/**
 * Fixture : `const page = await asRole("star")` ouvre une page connectée en tant que ce
 * compte de dev (storageState produit par auth.setup.ts), dans le viewport du projet.
 */
export const test = base.extend<{ asRole: (role: RoleKey) => Promise<Page> }>({
  asRole: async ({ browser, contextOptions }, provide) => {
    const contexts: { close(): Promise<void> }[] = [];
    await provide(async (role) => {
      const ctx = await browser.newContext({ ...contextOptions, storageState: authFile(role) });
      contexts.push(ctx);
      const page = await ctx.newPage();
      await hideDevOverlay(page);
      return page;
    });
    for (const c of contexts) await c.close();
  },
});

export { expect } from "@playwright/test";
