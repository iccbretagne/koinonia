import { test as setup, expect } from "@playwright/test";
import { authFile, ROLE_KEYS } from "./roles";

// Un storageState par compte de dev (prisma/fixtures/dev-users.ts). Nécessite
// AUTH_DEV_LOGIN=true et NODE_ENV!=production (garde de src/lib/auth.ts).
for (const key of ROLE_KEYS) {
  setup(`connexion ${key}`, async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL });
    const login = await request.post("/api/auth/dev-login", { form: { devUserKey: key } });
    expect(login.ok(), `dev-login ${key} (base seedée ? AUTH_DEV_LOGIN=true ?)`).toBeTruthy();
    const { cookies } = await request.storageState();
    expect(cookies.length, `cookie de session pour ${key}`).toBeGreaterThan(0);
    const tour = await request.patch("/api/user/tour-seen");
    expect(tour.ok()).toBeTruthy();
    await request.storageState({ path: authFile(key) });
    await request.dispose();
  });
}
