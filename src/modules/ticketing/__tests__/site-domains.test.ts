/** Tests — domaines dédiés des sites d'événement (spec 084, lot 3). */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const notifyEventTeam = vi.fn();
vi.mock("../services/team-notify", () => ({ notifyEventTeam: (...a: unknown[]) => notifyEventTeam(...a) }));

const { parseDomain, requestDomain, verifyDomain, checkDns, recheckDomains, approveDomain, approvedHosts } = await import("../services/site-domains");
const { traefikConfig } = await import("../traefik");

const TOKEN = "t".repeat(48);
const dns = (over: Partial<Record<"txt" | "cname" | "a" | "aTarget", string[]>> = {}) => ({
  resolveTxt: async () => (over.txt ?? [TOKEN]).map((t) => [t]),
  resolveCname: async () => over.cname ?? ["cible.koinonia.test."],
  resolve4: async (h: string) => (h === "cible.koinonia.test" ? (over.aTarget ?? ["1.2.3.4"]) : (over.a ?? [])),
  resolve6: async () => [],
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SITE_BASE_DOMAIN = "evenements.koinonia.test";
  process.env.SITE_TARGET_HOST = "cible.koinonia.test";
  process.env.APP_URL = "https://app.koinonia.test";
});
afterEach(() => {
  delete process.env.SITE_BASE_DOMAIN;
  delete process.env.SITE_TARGET_HOST;
  delete process.env.APP_URL;
});

describe("nom de domaine demandé", () => {
  it("normalise en minuscules", () => expect(parseDomain("Fete.Exemple.ORG")).toBe("fete.exemple.org"));
  it.each(["localhost", "1.2.3.4", "a_b.example.org", "-x.example.org", "exemple", "fete.exemple.org/x", "x.example.o", ""])("refuse %s", (v) => {
    expect(() => parseDomain(v)).toThrow();
  });
  it("refuse le domaine des sites, ses sous-domaines et ceux de l'application", () => {
    for (const v of ["evenements.koinonia.test", "fete.evenements.koinonia.test", "app.koinonia.test", "x.app.koinonia.test"]) expect(() => parseDomain(v)).toThrow();
  });
});

describe("demande", () => {
  const site = { id: "s1", churchId: "c1", domain: null };
  it("accepte un domaine valide avec un jeton aléatoire", async () => {
    prismaMock.ticketingSite.findUnique.mockResolvedValue(site);
    prismaMock.ticketingSiteDomain.count.mockResolvedValue(4);
    prismaMock.ticketingSiteDomain.findUnique.mockResolvedValue(null);
    prismaMock.ticketingSiteDomain.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "d1", status: "PENDING", lastCheckedAt: null, lastError: null, ...data }));
    const out = await requestDomain("ev1", "u1", "fete.exemple.org");
    expect(out.status).toBe("PENDING");
    expect(out.records[0]).toMatchObject({ type: "TXT", name: "_koinonia.fete.exemple.org" });
    expect(out.records[0].value).toMatch(/^[a-f0-9]{48}$/);
  });

  it("refuse le 6e domaine de l'église", async () => {
    prismaMock.ticketingSite.findUnique.mockResolvedValue(site);
    prismaMock.ticketingSiteDomain.count.mockResolvedValue(5);
    await expect(requestDomain("ev1", "u1", "fete.exemple.org")).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.ticketingSiteDomain.create).not.toHaveBeenCalled();
  });

  it("refuse un second domaine pour le même site", async () => {
    prismaMock.ticketingSite.findUnique.mockResolvedValue({ ...site, domain: { id: "d0" } });
    await expect(requestDomain("ev1", "u1", "autre.exemple.org")).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("vérification DNS", () => {
  it("TXT absent ⇒ reste en attente", async () => {
    prismaMock.ticketingSiteDomain.findFirst.mockResolvedValue({ id: "d1", churchId: "c1", host: "fete.exemple.org", proofToken: TOKEN, status: "PENDING", approvedById: null });
    prismaMock.ticketingSiteDomain.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "d1", host: "fete.exemple.org", proofToken: TOKEN, lastCheckedAt: null, ...data }));
    const out = await verifyDomain("ev1", "u1", dns({ txt: [] }));
    expect(out.status).toBe("PENDING");
    expect(out.lastError).toContain("TXT");
  });

  it("TXT et CNAME corrects ⇒ vérifié", async () => {
    prismaMock.ticketingSiteDomain.findFirst.mockResolvedValue({ id: "d1", churchId: "c1", host: "fete.exemple.org", proofToken: TOKEN, status: "PENDING", approvedById: null });
    prismaMock.ticketingSiteDomain.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "d1", host: "fete.exemple.org", proofToken: TOKEN, lastCheckedAt: null, ...data }));
    expect((await verifyDomain("ev1", "u1", dns())).status).toBe("VERIFIED");
  });

  it("mêmes adresses A à défaut de CNAME ; adresse différente refusée", async () => {
    expect(await checkDns("fete.exemple.org", TOKEN, dns({ cname: [], a: ["1.2.3.4"] }))).toBeNull();
    expect(await checkDns("fete.exemple.org", TOKEN, dns({ cname: [], a: ["9.9.9.9"] }))).toContain("ne pointe pas");
    expect(await checkDns("fete.exemple.org", TOKEN, dns({ cname: [], a: [] }))).toContain("ne pointe pas");
  });

  it("un jeton différent est refusé", async () => {
    expect(await checkDns("fete.exemple.org", "autre", dns())).toContain("TXT");
  });
});

describe("approbation et recontrôle", () => {
  it("n'approuve qu'un domaine vérifié", async () => {
    prismaMock.ticketingSiteDomain.findUnique.mockResolvedValue({ id: "d1", churchId: "c1", host: "x.exemple.org", status: "PENDING", site: { eventId: "ev1" } });
    await expect(approveDomain("d1", "sa")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("recontrôle en échec ⇒ suspendu et organisateur prévenu", async () => {
    prismaMock.ticketingSiteDomain.findMany.mockResolvedValue([{ id: "d1", host: "fete.exemple.org", proofToken: TOKEN, status: "APPROVED", site: { eventId: "ev1" } }]);
    const out = await recheckDomains(dns({ txt: [] }));
    expect(out).toEqual({ checked: 1, suspended: 1 });
    expect(prismaMock.ticketingSiteDomain.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUSPENDED" }) }));
    expect(notifyEventTeam).toHaveBeenCalledWith("ev1", ["ORGANIZER"], expect.objectContaining({ title: "Domaine suspendu" }));
  });

  it("recontrôle réussi ⇒ rien ne change", async () => {
    prismaMock.ticketingSiteDomain.findMany.mockResolvedValue([{ id: "d1", host: "fete.exemple.org", proofToken: TOKEN, status: "APPROVED", site: { eventId: "ev1" } }]);
    expect(await recheckDomains(dns())).toEqual({ checked: 1, suspended: 0 });
    expect(notifyEventTeam).not.toHaveBeenCalled();
  });

  it("approvedHosts : hôte → adresse du site", async () => {
    prismaMock.ticketingSiteDomain.findMany.mockResolvedValue([{ host: "fete.exemple.org", site: { slug: "nuit" } }]);
    expect(await approvedHosts()).toEqual({ "fete.exemple.org": "nuit" });
  });
});

describe("configuration Traefik", () => {
  it("un routeur par domaine approuvé, certificat letsencrypt", () => {
    const conf = traefikConfig(["a.exemple.org", "b.exemple.org"], "http://127.0.0.1:3001");
    expect(Object.keys(conf.http.routers)).toHaveLength(2);
    expect(conf.http.routers["koinonia-site-0"]).toMatchObject({ rule: "Host(`a.exemple.org`)", tls: { certResolver: "letsencrypt" } });
    expect(conf.http.services["koinonia-app"].loadBalancer.servers[0].url).toBe("http://127.0.0.1:3001");
  });
});
