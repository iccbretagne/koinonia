/**
 * Tests — duplication, export et import d'un événement (spec 084) : brouillon sans inscrit, paiement,
 * rôle ni affectation ; jamais d'IBAN ni de donnée personnelle ; images copiées ou retraitées et
 * identifiants remplacés ; JSON strictement validé ; nettoyage en cas d'échec.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const A = "a".repeat(25);
const NEW_A = "n".repeat(25);
const SOURCE = {
  id: "src",
  churchId: "c1",
  title: "Nuit de la traversée",
  description: "Une belle nuit",
  location: "Rennes",
  startsAt: new Date("2030-12-31T19:00:00Z"),
  endsAt: new Date("2031-01-01T05:00:00Z"),
  registrationDeadline: new Date("2030-12-24T19:00:00Z"),
  optionPaymentDeadline: new Date("2030-12-28T19:00:00Z"),
  entryRefundDeadline: null,
  capacity: 150,
  seatsOpen: 120,
  reminderDaysBefore: 3,
  allowOnsitePayment: true,
  allowUnaccompaniedMinors: false,
  allowWalkIns: false,
  entryRefundable: true,
  questions: [{ id: "q1", label: "Allergies ?", required: false }],
  retentionDays: 365,
  paymentMethods: { wero: { target: "06 11 22 33 44" }, transfer: { iban: "FR7630006000011234567890189", holder: "Trésorerie NDT" }, cash: true, cheque: false },
  tariffs: [{ ageGroup: "ADULT", price: 15 }, { ageGroup: "CHILD", price: 5 }],
  options: [
    { id: "opt-1", label: "Repas", description: null, type: "CHOICE", scope: "PARTICIPANT", price: 12, stock: 100, pickup: true, namedPrep: false, refundable: true, refundDeadline: new Date("2030-12-26T19:00:00Z"), active: true, position: 0, choiceGroup: "Repas", variants: [{ id: "v1", label: "Poulet", description: "Rôti", allergens: "gluten", stock: 50, position: 0 }, { id: "v2", label: "Végé", description: null, allergens: null, stock: null, position: 1 }] },
  ],
  // Données qui ne doivent jamais sortir de l'événement source.
  roles: [{ userId: "u9", role: "TREASURER", name: "Awa Traoré", email: "tresorier@exemple.fr" }],
  bookings: [{ contact: { name: "Jean Dupont", email: "jean@exemple.fr", phone: "0600000000" } }],
};

const events = {
  createEvent: vi.fn(async (..._a: unknown[]) => ({ id: "new", title: (_a[2] as { title: string }).title })),
  updateEvent: vi.fn(async (..._a: unknown[]) => ({})),
  createOption: vi.fn(async (..._a: unknown[]) => ({ id: `new-${(_a[2] as { label: string }).label}` })),
  getEventDetail: vi.fn(async () => SOURCE),
};
const menu = { addVariant: vi.fn(async (..._a: unknown[]) => ({})) };
const team = { createPost: vi.fn(async (..._a: unknown[]) => ({})) };
const site = {
  getSite: vi.fn(async () => ({ id: "site-new" })),
  saveDraft: vi.fn(async (..._a: unknown[]) => ({})),
  setAfterCloseDays: vi.fn(async (..._a: unknown[]) => ({})),
};
const assets = {
  copyAssets: vi.fn(async () => new Map([[A, NEW_A]])),
  discardSiteAssets: vi.fn(async () => undefined),
  exportAssets: vi.fn(async () => [{ id: A, name: "salle.webp", alt: "La salle", mime: "image/webp", base64: Buffer.from("webp").toString("base64") }]),
  stageAsset: vi.fn(async () => ({ id: NEW_A })),
  confirmAsset: vi.fn(async () => ({})),
  decodeBase64Image: vi.fn(() => Buffer.from("webp")),
};
vi.mock("../services/events", () => events);
vi.mock("../services/menu", () => menu);
vi.mock("../services/team", () => team);
vi.mock("../services/site", () => site);
vi.mock("../services/site-assets", () => assets);

const { defaultSiteDocument, eventExportSchema, eventCreateSchema, variantCreateSchema } = await import("../schemas");
const { duplicateEvent, buildEventExport, importEvent } = await import("../services/exchange");

const doc = () => {
  const d = defaultSiteDocument("Nuit");
  d.theme.logoAssetId = A;
  return d;
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.ticketingEvent.findUnique.mockResolvedValue({ churchId: "c1", title: SOURCE.title });
  prismaMock.ticketingEvent.delete.mockResolvedValue({});
  prismaMock.ticketingPost.findMany.mockResolvedValue([{ name: "Porte", position: 0 }, { name: "Vestiaire", position: 1 }]);
  prismaMock.ticketingSite.findUnique.mockResolvedValue({ id: "site-src", draft: doc(), afterCloseDays: 45 });
});

describe("duplicateEvent", () => {
  const input = { startsAt: new Date("2031-12-30T19:00:00Z") };

  it("brouillon : titre « (copie) », dates décalées, paramétrage, options, plats et postes", async () => {
    const { event, summary } = await duplicateEvent("src", "c1", "user-1", input);
    expect(event.title).toBe("Nuit de la traversée (copie)");
    expect(events.createEvent).toHaveBeenCalledWith("c1", "user-1", expect.objectContaining({ title: "Nuit de la traversée (copie)", startsAt: input.startsAt, capacity: 150, description: "Une belle nuit", location: "Rennes" }));
    // Fin : même durée ; échéances : même décalage (364 jours).
    expect((events.createEvent.mock.calls[0][2] as { endsAt: Date }).endsAt.toISOString()).toBe("2031-12-31T05:00:00.000Z");
    const update = events.updateEvent.mock.calls[0][2] as Record<string, unknown>;
    expect((update.registrationDeadline as Date).toISOString()).toBe("2031-12-23T19:00:00.000Z");
    expect((update.optionPaymentDeadline as Date).toISOString()).toBe("2031-12-27T19:00:00.000Z");
    expect(update).toMatchObject({ seatsOpen: 120, tariffs: SOURCE.tariffs, allowOnsitePayment: true, questions: SOURCE.questions, retentionDays: 365 });
    expect("status" in update).toBe(false);
    expect(events.createOption).toHaveBeenCalledWith("new", "user-1", expect.objectContaining({ label: "Repas", price: 12, choiceGroup: "Repas", refundDeadline: new Date("2031-12-25T19:00:00Z") }));
    expect(menu.addVariant).toHaveBeenCalledTimes(2);
    expect(menu.addVariant).toHaveBeenCalledWith("new", "new-Repas", "user-1", expect.objectContaining({ label: "Poulet", allergens: "gluten", stock: 50, position: 0 }));
    expect(team.createPost.mock.calls.map((c) => c[2])).toEqual(["Porte", "Vestiaire"]);
    expect(summary).toEqual({ options: 1, variants: 2, posts: 2, images: 1, site: true });
  });

  it("moyens de paiement sans l'IBAN ; aucune donnée d'inscrit, de rôle ou de paiement transmise", async () => {
    await duplicateEvent("src", "c1", "user-1", { ...input, title: "Nuit 2031" });
    const update = events.updateEvent.mock.calls[0][2] as { paymentMethods: Record<string, unknown> };
    expect(update.paymentMethods.transfer).toBeNull();
    expect(update.paymentMethods).toMatchObject({ cash: true, cheque: false });
    const everything = JSON.stringify([events.createEvent.mock.calls, events.updateEvent.mock.calls, events.createOption.mock.calls, menu.addVariant.mock.calls, team.createPost.mock.calls, site.saveDraft.mock.calls]);
    for (const secret of ["FR7630006000011234567890189", "Trésorerie NDT", "tresorier@exemple.fr", "Awa Traoré", "jean@exemple.fr", "0600000000", "Jean Dupont"]) expect(everything).not.toContain(secret);
    expect(events.createEvent.mock.calls[0][2]).toMatchObject({ title: "Nuit 2031" });
  });

  it("site : brouillon copié, images copiées, identifiants remplacés, jamais publié", async () => {
    await duplicateEvent("src", "c1", "user-1", input);
    expect(assets.copyAssets).toHaveBeenCalledWith("site-src", "site-new");
    const saved = site.saveDraft.mock.calls[0] as unknown as [string, string, { theme: { logoAssetId: string } }];
    expect(saved[0]).toBe("new");
    expect(saved[2].theme.logoAssetId).toBe(NEW_A);
    expect(site.setAfterCloseDays).toHaveBeenCalledWith("new", "user-1", 45);
  });

  it("source sans site : pas de site créé ; autre église : introuvable", async () => {
    prismaMock.ticketingSite.findUnique.mockResolvedValue(null);
    expect((await duplicateEvent("src", "c1", "user-1", input)).summary.site).toBe(false);
    expect(site.getSite).not.toHaveBeenCalled();
    prismaMock.ticketingEvent.findUnique.mockResolvedValue({ churchId: "autre", title: "x" });
    await expect(duplicateEvent("src", "c1", "user-1", input)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("échec en cours de route : la copie est supprimée, images comprises", async () => {
    site.saveDraft.mockRejectedValueOnce(new Error("boum"));
    await expect(duplicateEvent("src", "c1", "user-1", input)).rejects.toThrow("boum");
    expect(assets.discardSiteAssets).toHaveBeenCalledWith("site-src");
    expect(prismaMock.ticketingEvent.delete).toHaveBeenCalledWith({ where: { id: "new" } });
  });
});

describe("buildEventExport", () => {
  it("JSON versionné valide, sans IBAN, sans moyen de paiement nominatif, sans donnée personnelle", async () => {
    const json = JSON.parse(JSON.stringify(await buildEventExport("src")));
    expect(json).toMatchObject({ format: "koinonia-ticketing-event", version: 1 });
    expect(json.event.paymentMethods).toEqual({ cash: true, cheque: false });
    expect(json.options[0]).toMatchObject({ id: "o1", label: "Repas" });
    expect(json.variants.map((v: { optionId: string }) => v.optionId)).toEqual(["o1", "o1"]);
    expect(json.posts).toEqual([{ name: "Porte", position: 0 }, { name: "Vestiaire", position: 1 }]);
    expect(json.assets).toHaveLength(1);
    const text = JSON.stringify(json);
    for (const secret of ["FR7630006000011234567890189", "Trésorerie", "06 11 22 33 44", "wero", "tresorier@exemple.fr", "Awa", "jean@exemple.fr", "0600000000", "Dupont", "u9", "opt-1", "src"]) expect(text, secret).not.toContain(secret);
    expect(eventExportSchema.safeParse(json).success).toBe(true);
  });

  it("sans site : pas de document ni d'images", async () => {
    prismaMock.ticketingSite.findUnique.mockResolvedValue(null);
    const json = JSON.parse(JSON.stringify(await buildEventExport("src")));
    expect(json.site).toBeNull();
    expect(json.assets).toEqual([]);
    expect(assets.exportAssets).not.toHaveBeenCalled();
  });
});

describe("importEvent", () => {
  async function exported() {
    return eventExportSchema.parse(JSON.parse(JSON.stringify(await buildEventExport("src"))));
  }

  it("crée un brouillon dans l'église demandée, remappe les images, repasse par le traitement des images", async () => {
    const { event, summary } = await importEvent("autre-eglise", "user-2", await exported());
    expect(events.createEvent).toHaveBeenCalledWith("autre-eglise", "user-2", expect.objectContaining({ title: "Nuit de la traversée", capacity: 150 }));
    expect(events.updateEvent.mock.calls[0][2]).toMatchObject({ paymentMethods: { cash: true, cheque: false } });
    expect("status" in (events.updateEvent.mock.calls[0][2] as object)).toBe(false);
    expect(assets.decodeBase64Image).toHaveBeenCalledTimes(1);
    expect(assets.stageAsset).toHaveBeenCalledWith("site-new", expect.any(Buffer), { alt: "La salle", name: "salle.webp" });
    expect(assets.confirmAsset).toHaveBeenCalledWith("site-new", NEW_A, "user-2");
    const saved = site.saveDraft.mock.calls[0] as unknown as [string, string, { theme: { logoAssetId: string } }];
    expect(saved[2].theme.logoAssetId).toBe(NEW_A);
    expect(event.id).toBe("new");
    expect(summary).toMatchObject({ options: 1, variants: 2, posts: 2, images: 1, site: true });
  });

  it("image refusée au traitement : tout est supprimé", async () => {
    assets.stageAsset.mockRejectedValueOnce(new Error("Format d'image non pris en charge"));
    await expect(importEvent("c1", "user-2", await exported())).rejects.toThrow("Format");
    expect(prismaMock.ticketingEvent.delete).toHaveBeenCalledWith({ where: { id: "new" } });
    expect(assets.discardSiteAssets).toHaveBeenCalled();
  });
});

describe("eventExportSchema : JSON strict", () => {
  async function base() {
    return JSON.parse(JSON.stringify(await buildEventExport("src")));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON de test modifié librement
  const invalid = async (change: (j: Record<string, any>) => void) => {
    const j = await base();
    change(j);
    return eventExportSchema.safeParse(j).success;
  };

  it("valide tel quel", async () => expect(await invalid(() => undefined)).toBe(true));

  it("refuse un autre format ou une version future", async () => {
    expect(await invalid((j) => void (j.format = "autre"))).toBe(false);
    expect(await invalid((j) => void (j.version = 2))).toBe(false);
  });

  it("refuse tout champ inconnu, donnée personnelle comprise", async () => {
    expect(await invalid((j) => void (j.bookings = []))).toBe(false);
    expect(await invalid((j) => void (j.event.contactEmail = "a@b.fr"))).toBe(false);
    expect(await invalid((j) => void (j.event.paymentMethods.transfer = { iban: "FR76", holder: "x" }))).toBe(false);
    expect(await invalid((j) => void (j.options[0].createdById = "u1"))).toBe(false);
    expect(await invalid((j) => void (j.assets[0].path = "/etc/passwd"))).toBe(false);
  });

  it("mêmes bornes que les écrans", async () => {
    expect(await invalid((j) => void (j.event.title = ""))).toBe(false);
    expect(await invalid((j) => void (j.event.capacity = 100_001))).toBe(false);
    expect(await invalid((j) => void (j.event.seatsOpen = 999))).toBe(false);
    expect(await invalid((j) => void (j.event.endsAt = j.event.startsAt))).toBe(false);
    expect(await invalid((j) => void (j.event.retentionDays = 1))).toBe(false);
    expect(await invalid((j) => void (j.tariffs.push({ ageGroup: "ADULT", price: 1 })))).toBe(false);
    expect(await invalid((j) => void (j.options[0].price = -1))).toBe(false);
    expect(await invalid((j) => void (j.options[0].type = "AUTRE"))).toBe(false);
  });

  it("références cohérentes : plat d'une option inconnue, image du site absente, identifiants en double", async () => {
    expect(await invalid((j) => void (j.variants[0].optionId = "o9"))).toBe(false);
    expect(await invalid((j) => void (j.assets = []))).toBe(false);
    expect(await invalid((j) => void j.assets.push({ ...j.assets[0] }))).toBe(false);
    expect(await invalid((j) => void j.options.push({ ...j.options[0] }))).toBe(false);
  });

  it("document du site validé comme à l'écran (lien interdit refusé)", async () => {
    expect(await invalid((j) => void (j.site.document.pages[0].sections[0].blocks[0].button = { label: "x", target: { url: "http://non" } }))).toBe(false);
  });

  it("image : type annoncé fixe (WebP), poids borné", async () => {
    expect(await invalid((j) => void (j.assets[0].mime = "image/svg+xml"))).toBe(false);
    expect(await invalid((j) => void (j.assets[0].base64 = "A".repeat(11_500_001)))).toBe(false);
  });
});

describe("création : champs facultatifs rétrocompatibles", () => {
  const base = { title: "Nuit", startsAt: "2030-01-01T10:00:00Z", endsAt: "2030-01-02T10:00:00Z", capacity: 10 };
  it("lieu et description facultatifs, null à défaut", () => {
    expect(eventCreateSchema.parse(base)).toMatchObject({ location: null, description: null });
    expect(eventCreateSchema.parse({ ...base, location: " Rennes ", description: "Belle nuit" })).toMatchObject({ location: "Rennes", description: "Belle nuit" });
    expect(eventCreateSchema.safeParse({ ...base, location: "x".repeat(201) }).success).toBe(false);
  });
  it("plat : position facultative à la création", () => {
    expect(variantCreateSchema.parse({ label: "Poulet" }).position).toBeUndefined();
    expect(variantCreateSchema.parse({ label: "Poulet", position: 3 })).toMatchObject({ position: 3 });
    expect(variantCreateSchema.safeParse({ label: "Poulet", position: -1 }).success).toBe(false);
  });
});
