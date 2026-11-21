/** Tests — service du site d'événement (spec 084) : création, brouillon, publication, visibilité publique. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const getSitesEnabled = vi.fn();
vi.mock("../services/site-settings", () => ({ getSitesEnabled: (...a: unknown[]) => getSitesEnabled(...a) }));
const getPublicEvent = vi.fn();
vi.mock("../services/events", async (orig) => ({ ...(await orig<typeof import("../services/events")>()), getPublicEvent: (...a: unknown[]) => getPublicEvent(...a) }));

// Drapeau d'instance des sites : actif pour ces tests (coupé par défaut).
process.env.TICKETING_SITES_ENABLED = "true";
const { getSite, saveDraft, publicSiteView, siteSlugBase, resolveSiteByHost } = await import("../services/site");
const { defaultSiteDocument } = await import("../site-schemas");

const DAY = 24 * 3600 * 1000;
const ASSET = "c".repeat(25);

beforeEach(() => {
  vi.clearAllMocks();
  getSitesEnabled.mockResolvedValue(true);
});

describe("sous-domaine du site", () => {
  it("dérivé du slug de l'événement : minuscules, chiffres, tirets, 63 caractères", () => {
    expect(siteSlugBase("Nuit-de-la-traversée")).toBe("nuit-de-la-traversee");
    expect(siteSlugBase("a".repeat(80))).toHaveLength(63);
  });

  it("un mot réservé est suffixé", () => {
    for (const word of ["www", "app", "api", "admin", "mail", "recette", "staging", "static", "assets", "cdn"]) {
      expect(siteSlugBase(word)).toBe(`${word}-evenement`);
    }
  });

  it("getSite crée le site avec un sous-domaine unique (suffixe en cas de collision)", async () => {
    prismaMock.ticketingSite.findUnique.mockResolvedValueOnce(null); // pas de site pour l'événement
    prismaMock.ticketingEvent.findUniqueOrThrow.mockResolvedValue({ churchId: "c1", slug: "nuit", title: "Nuit" });
    prismaMock.ticketingSite.findUnique.mockResolvedValueOnce({ id: "x" }); // « nuit » pris
    prismaMock.ticketingSite.findUnique.mockResolvedValueOnce(null); // « nuit-2 » libre
    prismaMock.ticketingSite.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "s1", ...data, published: null, publishedAt: null, afterCloseDays: 30, updatedAt: new Date() }));
    const site = await getSite("ev1");
    expect(site.slug).toBe("nuit-2");
    expect(site.draft.pages[0].sections[0].blocks[0]).toMatchObject({ kind: "hero", title: "Nuit" });
  });
});

describe("saveDraft", () => {
  function existing(draft = defaultSiteDocument("Fête")) {
    prismaMock.ticketingSite.findUnique.mockResolvedValue({ id: "s1", eventId: "ev1", churchId: "c1", slug: "fete", draft, published: null, publishedAt: null, afterCloseDays: 30, updatedAt: new Date() });
    prismaMock.ticketingSite.update.mockResolvedValue({ churchId: "c1" });
  }

  it("refuse un contraste insuffisant, en nommant le problème", async () => {
    existing();
    const doc = defaultSiteDocument("Fête");
    doc.theme.colors.text = "#fafafa";
    await expect(saveDraft("ev1", "u1", doc)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("peu lisible") });
    expect(prismaMock.ticketingSite.update).not.toHaveBeenCalled();
  });

  it("refuse une image qui n'appartient pas au site", async () => {
    existing();
    prismaMock.ticketingSiteAsset.findMany.mockResolvedValue([]);
    const doc = defaultSiteDocument("Fête");
    doc.theme.logoAssetId = ASSET;
    await expect(saveDraft("ev1", "u1", doc)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("image") });
  });

  it("refuse un document invalide (lien javascript:)", async () => {
    existing();
    const doc = defaultSiteDocument("Fête") as unknown as { pages: { sections: { blocks: unknown[] }[] }[] };
    doc.pages[0].sections[0].blocks.push({ kind: "richText", content: [{ type: "p", children: [{ text: "x", href: "javascript:alert(1)" }] }] });
    await expect(saveDraft("ev1", "u1", doc)).rejects.toBeTruthy();
  });

  it("enregistre un brouillon valide", async () => {
    existing();
    await saveDraft("ev1", "u1", defaultSiteDocument("Fête"));
    expect(prismaMock.ticketingSite.update).toHaveBeenCalled();
  });
});

describe("publicSiteView : visibilité", () => {
  const published = defaultSiteDocument("Fête");
  function site(over: { event?: Record<string, unknown>; published?: unknown } = {}) {
    prismaMock.ticketingSite.findUnique.mockResolvedValue({
      slug: "fete",
      churchId: "c1",
      published: "published" in over ? over.published : published,
      afterCloseDays: 30,
      updatedAt: new Date("2030-01-01"),
      event: { slug: "fete", title: "Fête", status: "OPEN", closedAt: null, church: { slug: "icc", name: "ICC" }, ...over.event },
    });
    getPublicEvent.mockResolvedValue({ title: "Fête" });
  }

  it("publié et ouvert : visible avec les données publiques", async () => {
    site();
    const view = await publicSiteView("fete");
    expect(view).toMatchObject({ ended: false, event: { title: "Fête" }, churchSlug: "icc", eventSlug: "fete" });
  });

  it("non publié, événement en brouillon, église coupée : 404", async () => {
    site({ published: null });
    expect(await publicSiteView("fete")).toBeNull();
    site({ event: { status: "DRAFT" } });
    expect(await publicSiteView("fete")).toBeNull();
    site();
    getSitesEnabled.mockResolvedValue(false);
    expect(await publicSiteView("fete")).toBeNull();
  });

  it("clôturé : « terminé » pendant afterCloseDays, puis 404", async () => {
    const closedAt = new Date("2031-01-01T00:00:00Z");
    site({ event: { status: "ARCHIVED", closedAt } });
    expect(await publicSiteView("fete", new Date(closedAt.getTime() + 29 * DAY))).toMatchObject({ ended: true, event: null });
    expect(await publicSiteView("fete", new Date(closedAt.getTime() + 31 * DAY))).toBeNull();
  });
});

describe("resolveSiteByHost", () => {
  it("sous-domaine de SITE_BASE_DOMAIN", async () => {
    process.env.SITE_BASE_DOMAIN = "evenements.example.org";
    prismaMock.ticketingSite.findUnique.mockResolvedValue({ slug: "fete" });
    expect(await resolveSiteByHost("Fete.evenements.example.org:443")).toEqual({ slug: "fete" });
    delete process.env.SITE_BASE_DOMAIN;
  });

  it("domaine dédié : seulement approuvé", async () => {
    prismaMock.ticketingSiteDomain.findFirst.mockResolvedValue(null);
    expect(await resolveSiteByHost("fete.exemple.fr")).toBeNull();
    expect(prismaMock.ticketingSiteDomain.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { host: "fete.exemple.fr", status: "APPROVED" } }));
  });
});

describe("drapeau d'instance des sites", () => {
  it("coupé : getSite répond 404, rien n'est créé", async () => {
    process.env.TICKETING_SITES_ENABLED = "false";
    try {
      await expect(getSite("ev-1")).rejects.toMatchObject({ statusCode: 404 });
      expect(prismaMock.ticketingSite.create).not.toHaveBeenCalled();
    } finally {
      process.env.TICKETING_SITES_ENABLED = "true";
    }
  });
});
