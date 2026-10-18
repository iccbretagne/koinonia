import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));
const alertPaymentDetailsChange = vi.fn();
vi.mock("../services/alerts", () => ({
  alertPaymentDetailsChange: (...args: unknown[]) => alertPaymentDetailsChange(...args),
}));

const { getPublicGivingPage, getGivingSettings, updateGivingPage } = await import("../services/giving-page");
const { defaultGivingContent } = await import("../services/defaults");

const IBAN = "FR7630006000011234567890189";
const IBAN2 = "DE89370400440532013000";
const actor = { id: "user-1", name: "Marie" };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "gp-1",
    churchId: "church-1",
    updatedById: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...defaultGivingContent("ICC Rennes"),
    enabled: true,
    transferEnabled: true,
    iban: IBAN,
    ...overrides,
  };
}

function church(givingPage: unknown) {
  return { id: "church-1", name: "ICC Rennes", slug: "icc-rennes", accountingEmails: "compta@icc.fr", givingPage };
}

function input(overrides: Record<string, unknown> = {}) {
  const { id: _id, churchId: _c, updatedById: _u, createdAt: _cr, updatedAt: _up, ...content } = row(overrides);
  return { churchId: "church-1", ...content } as Parameters<typeof updateGivingPage>[0];
}

describe("getPublicGivingPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["église inconnue", null],
    ["page absente", church(null)],
    ["page désactivée", church(row({ enabled: false }))],
  ])("renvoie null : %s", async (_label, found) => {
    prismaMock.church.findUnique.mockResolvedValue(found);
    expect(await getPublicGivingPage("icc-rennes")).toBeNull();
  });

  it("ne projette que les sections activées, sans identifiant interne", async () => {
    prismaMock.church.findUnique.mockResolvedValue(church(row()));
    const page = await getPublicGivingPage("icc-rennes");
    expect(page?.churchName).toBe("ICC Rennes");
    expect(page?.transfer?.iban).toBe(IBAN);
    expect(page?.online).toBeNull();
    expect(JSON.stringify(page)).not.toMatch(/church-1|user-1|gp-1/);
  });
});

describe("getGivingSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("propose les défauts, page inactive, si jamais configurée", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ ...church(null), accountingEmails: null });
    const settings = await getGivingSettings("church-1");
    expect(settings.configured).toBe(false);
    expect(settings.content.enabled).toBe(false);
    expect(settings.content.verseReference).toBe("2 Corinthiens 9:7");
    expect(settings.hasAccountingEmails).toBe(false);
    expect(settings.publicUrl).toMatch(/\/donner\/icc-rennes$/);
  });

  it("404 si l'église n'existe pas", async () => {
    prismaMock.church.findUnique.mockResolvedValue(null);
    await expect(getGivingSettings("x")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("updateGivingPage", () => {
  beforeEach(() => vi.clearAllMocks());

  function setup(previous: ReturnType<typeof row> | null, saved: ReturnType<typeof row>) {
    prismaMock.church.findUnique.mockResolvedValue(church(previous));
    prismaMock.givingPage.upsert.mockResolvedValue(saved);
  }

  it("un IBAN modifié déclenche l'audit et l'alerte avec ancienne et nouvelle valeur", async () => {
    setup(row(), row({ iban: IBAN2 }));
    await updateGivingPage(input({ iban: IBAN2 }), actor);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityType: "GivingPage", churchId: "church-1" })
    );
    const changes = alertPaymentDetailsChange.mock.calls[0][1];
    expect(changes).toEqual([{ label: "IBAN", before: "FR76 3000 6000 0112 3456 7890 189", after: "DE89 3704 0044 0532 0130 00" }]);
    expect(prismaMock.givingPage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ updatedById: "user-1" }) })
    );
  });

  it("un verset modifié seul n'écrit que l'audit, sans alerte", async () => {
    setup(row(), row({ verseText: "Autre verset" }));
    await updateGivingPage(input({ verseText: "Autre verset" }), actor);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ changedFields: ["verseText"], alerted: [] }) })
    );
    expect(alertPaymentDetailsChange.mock.calls[0][1]).toEqual([]);
  });

  it("une désactivation déclenche l'alerte", async () => {
    setup(row(), row({ enabled: false }));
    await updateGivingPage(input({ enabled: false }), actor);
    expect(alertPaymentDetailsChange.mock.calls[0][1]).toContainEqual({ label: "Page", before: "active", after: "désactivée" });
  });

  it("une première création avec coordonnées compte comme un changement", async () => {
    setup(null, row());
    await updateGivingPage(input(), actor);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE" }));
    const labels = alertPaymentDetailsChange.mock.calls[0][1].map((c: { label: string }) => c.label);
    expect(labels).toEqual(expect.arrayContaining(["IBAN", "Bénéficiaire", "Virement affiché"]));
  });

  it("aucune modification : ni audit ni alerte", async () => {
    setup(row(), row());
    await updateGivingPage(input(), actor);
    expect(logAudit).not.toHaveBeenCalled();
    expect(alertPaymentDetailsChange.mock.calls[0][1]).toEqual([]);
  });
});
