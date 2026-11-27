import { expect, test } from "./roles";

// Spec 092, lot 4 : les anciennes adresses mènent à la nouvelle (307, même origine), la requête
// est conservée, les liens publics et les autres méthodes ne sont jamais redirigés.

const BY_ROLE: { role: string; from: string; to: string }[] = [
  { role: "admin", from: "/events", to: "/evenements" },
  { role: "admin", from: "/admin/events", to: "/evenements/gestion" },
  { role: "admin", from: "/admin/members", to: "/personnes/star" },
  { role: "secretaire", from: "/secretariat/requests", to: "/demandes/traitement" },
  { role: "comptable", from: "/accounting/requests", to: "/finances/demandes" },
  { role: "reporter", from: "/admin/reports", to: "/evenements/comptes-rendus" },
  { role: "star", from: "/planning/events", to: "/evenements" },
  { role: "star", from: "/requests", to: "/demandes" },
  { role: "super-admin", from: "/admin/churches", to: "/plateforme/eglises" },
];

for (const { role, from, to } of BY_ROLE) {
  test(`${role} : ${from} → ${to}`, async ({ asRole }) => {
    const page = await asRole(role);
    await page.goto(from);
    expect(new URL(page.url()).pathname).toBe(to);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Accès refusé");
  });
}

test("307 sans cache, même origine, requête conservée", async ({ asRole, baseURL }) => {
  const page = await asRole("admin");
  const res = await page.request.get("/dashboard?dept=abc&view=week", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["cache-control"]).toBe("no-store");
  const location = new URL(res.headers()["location"], baseURL);
  expect(location.origin).toBe(new URL(baseURL!).origin);
  expect(location.pathname).toBe("/planning/departements");
  expect(location.searchParams.get("dept")).toBe("abc");
  expect(location.searchParams.get("view")).toBe("week");
});

test("une méthode autre que GET/HEAD n'est jamais redirigée", async ({ asRole }) => {
  const page = await asRole("admin");
  const res = await page.request.post("/events", { maxRedirects: 0, data: {} });
  expect(res.status()).not.toBe(307);
  expect(res.headers()["location"]).toBeUndefined();
});

test("liens publics et pages de compte : jamais redirigés", async ({ asRole }) => {
  const page = await asRole("star");
  for (const path of ["/media/v/jeton-inconnu", "/billet/jeton-inconnu", "/reservation/jeton-inconnu", "/f/eglise/formulaire", "/accueil", "/profile", "/guide"]) {
    const res = await page.request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).not.toBe(307);
    expect(res.headers()["location"], path).toBeUndefined();
  }
});

test("entrée hostile : jamais vers une autre origine", async ({ asRole, baseURL }) => {
  const page = await asRole("admin");
  for (const path of ["//evil.example/events", "/accounting/requests/%2F%2Fevil.example", "/accounting/requests/%5Cevil.example", "/accounting/requests/%2e%2e"]) {
    // Adresse absolue construite à la main : le client ne doit pas lire `//x` comme un autre hôte.
    const res = await page.request.get(`${baseURL}${path}`, { maxRedirects: 0 });
    const location = res.headers()["location"];
    if (location) expect(new URL(location, baseURL).origin, path).toBe(new URL(baseURL!).origin);
  }
});
