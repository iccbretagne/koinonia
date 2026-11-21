/**
 * Tests — duplication, export et import d'un événement par l'assistant IA (spec 084) : rôles,
 * ticketing:manage, brouillon, aucune donnée personnelle ni IBAN, JSON invalide refusé, import dans
 * une autre église que la source.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { viewerFor } from "../../assistant/__tests__/viewers";

let stored: Record<string, unknown> = {};
let lastToken = "";
const mcp = {
  createConfirmation: vi.fn(async (_g: string, _a: string, payload: unknown) => {
    lastToken = `kmx_tok_${Object.keys(stored).length + 1}`;
    stored[lastToken] = payload;
    return { token: lastToken, expiresAt: new Date("2099-01-01T00:05:00Z") };
  }),
  consumeConfirmation: vi.fn(async (_g: string, _a: string, token: string) => stored[token] ?? null),
  publicOrigin: () => "https://koinonia.test",
};
vi.mock("@/modules/mcp", () => mcp);
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => audit(...a), withAuditContext: async (_e: unknown, fn: () => Promise<unknown>) => fn() }));

const { EVENT_ACTIONS } = await import("@/modules/ticketing/auth");
const MATRIX = EVENT_ACTIONS as unknown as Record<string, string[]>;
const { defaultSiteDocument } = await import("@/modules/ticketing/schemas");

let roles = new Set<string>(["ORGANIZER"]);
let manager = true;
const A = "a".repeat(25);
const DETAIL = {
  id: "tk-1", title: "Nuit de la traversée", startsAt: new Date("2099-12-31T19:00:00Z"), endsAt: new Date("2100-01-01T05:00:00Z"), capacity: 150,
  updatedAt: new Date("2099-01-01T00:00:00Z"), options: [{ id: "o1", variants: [{ id: "v1" }] }],
};
const EXPORT = () => {
  const site = defaultSiteDocument("Nuit");
  site.theme.logoAssetId = A;
  return {
    format: "koinonia-ticketing-event",
    version: 1,
    event: { title: "Nuit de la traversée", description: "Belle nuit", location: "Rennes", startsAt: "2099-12-31T19:00:00.000Z", endsAt: "2100-01-01T05:00:00.000Z", registrationDeadline: null, capacity: 150, seatsOpen: 100, optionPaymentDeadline: null, reminderDaysBefore: 3, allowOnsitePayment: true, allowUnaccompaniedMinors: false, allowWalkIns: false, entryRefundable: true, entryRefundDeadline: null, questions: [], retentionDays: 365, paymentMethods: { cash: true, cheque: false } },
    tariffs: [{ ageGroup: "ADULT", price: 15 }],
    options: [{ id: "o1", label: "Repas", description: null, type: "CHOICE", scope: "PARTICIPANT", price: 12, stock: null, pickup: false, namedPrep: false, refundable: true, refundDeadline: null, active: true, position: 0, choiceGroup: null }],
    variants: [{ optionId: "o1", label: "Poulet", description: null, allergens: null, stock: null, position: 0 }],
    posts: [{ name: "Porte", position: 0 }],
    site: { document: site, afterCloseDays: 30 },
    assets: [{ id: A, name: "logo.webp", alt: "Logo", mime: "image/webp", base64: Buffer.from("webp").toString("base64") }],
  };
};

const svc = {
  isTicketingManager: vi.fn(async () => manager),
  listEvents: vi.fn(async () => [{ id: "tk-1", title: "Nuit de la traversée", startsAt: DETAIL.startsAt, status: "OPEN" }]),
  getEventAccess: vi.fn(async (_s: unknown, id: string) => ({ eventId: id, churchId: "c1", status: "OPEN", manager, roles })),
  canDo: (access: { roles: Set<string> }, action: string) => MATRIX[action].some((r) => access.roles.has(r)),
  getEventDetail: vi.fn(async () => DETAIL),
  duplicateEvent: vi.fn(async (_s: string, _c: string, _u: string, input: { title?: string }) => ({ event: { id: "tk-2", title: input.title ?? "Nuit de la traversée (copie)" }, summary: { options: 1, variants: 1, posts: 1, images: 1, site: true } })),
  buildEventExport: vi.fn(async () => EXPORT()),
  summarizeImport: vi.fn(() => ({ options: 1, variants: 1, posts: 1, images: 1, site: true })),
  importEvent: vi.fn(async (_c: string, _u: string, data: { event: { title: string } }) => ({ event: { id: "tk-9", title: data.event.title }, summary: { options: 1, variants: 1, posts: 1, images: 1, site: true } })),
};
vi.mock("@/modules/ticketing", () => svc);

const t = await import("../_actions/event-transfer");
const A_ = (name: string) => t.TRANSFER_ACTIONS.find((a) => a.name === name)!;
const ctx = { session: { user: { id: "user-1" } } as never, churchId: "c1", viewer: viewerFor("ADMIN", { predicates: ["ticketing"] }), grantId: "g1" };
const preview = (action: string, input: unknown) => A_(`${action}_preview`).run(input as never, ctx);
const confirm = (action: string, token = lastToken) => A_(`${action}_confirm`).run({ confirmation: token } as never, ctx);

beforeEach(() => {
  vi.clearAllMocks();
  stored = {};
  lastToken = "";
  roles = new Set(["ORGANIZER"]);
  manager = true;
});

describe("duplication", () => {
  const input = { event: "tk-1", startsAt: "2100-12-31 20:00" };

  it("aperçu : brouillon, ce qui est repris et non repris ; confirmation : service appelé, copie journalisée", async () => {
    const p = await preview("duplicate_ticketing_event", input);
    expect(p.text).toContain("Nuit de la traversée (copie)");
    expect(p.text).toContain("BROUILLON".toLowerCase());
    expect(p.text).toContain("Non repris : inscrits, paiements, rôles, affectations, IBAN");
    expect(svc.duplicateEvent).not.toHaveBeenCalled();
    const done = await confirm("duplicate_ticketing_event");
    expect(done.structured.done).toBe(true);
    expect(svc.duplicateEvent).toHaveBeenCalledWith("tk-1", "c1", "user-1", expect.objectContaining({ startsAt: expect.any(Date) }));
    expect(done.text).toContain("tk-2");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityType: "TicketingEvent", entityId: "tk-2", details: { duplicatedFrom: "tk-1" } }));
  });

  it("exige le rôle configure sur la source ET ticketing:manage dans l'église", async () => {
    roles = new Set(["TREASURER"]);
    expect((await preview("duplicate_ticketing_event", input)).structured.done).toBe(false);
    roles = new Set(["ORGANIZER"]);
    manager = false;
    expect((await preview("duplicate_ticketing_event", input)).text).toContain("réservée");
    // Rôle perdu entre l'aperçu et la confirmation.
    manager = true;
    await preview("duplicate_ticketing_event", input);
    manager = false;
    expect((await confirm("duplicate_ticketing_event")).structured.done).toBe(false);
    expect(svc.duplicateEvent).not.toHaveBeenCalled();
    // Outil proposé seulement à qui a ticketing:manage.
    expect(A_("duplicate_ticketing_event_preview").available(viewerFor("STAR", { predicates: ["ticketing"] }))).toBe(false);
    expect(A_("duplicate_ticketing_event_preview").available(ctx.viewer)).toBe(true);
  });

  it("fin avant le début refusée ; source d'une autre église refusée", async () => {
    expect((await preview("duplicate_ticketing_event", { ...input, endsAt: "2100-12-30 10:00" })).text).toContain("La fin doit suivre");
    svc.getEventAccess.mockResolvedValueOnce({ eventId: "tk-1", churchId: "autre", status: "OPEN", manager, roles } as never);
    expect((await preview("duplicate_ticketing_event", input)).structured.done).toBe(false);
  });

  it("la source modifiée entre l'aperçu et la confirmation : refus", async () => {
    await preview("duplicate_ticketing_event", input);
    svc.getEventDetail.mockResolvedValueOnce({ ...DETAIL, updatedAt: new Date("2099-06-01T00:00:00Z") } as never);
    expect((await confirm("duplicate_ticketing_event")).text).toContain("ont changé");
  });
});

describe("export", () => {
  it("rôle configure ; JSON complet dans le texte et en structuré, sans donnée personnelle", async () => {
    const out = await A_("export_ticketing_event").run({ event: "tk-1" } as never, ctx);
    expect(out.structured).toMatchObject({ format: "koinonia-ticketing-event", version: 1, summary: { options: 1 } });
    const text = out.text.slice(out.text.indexOf("\n") + 1);
    expect(text).toContain('"format":"koinonia-ticketing-event"');
    for (const secret of ["iban", "email", "phone", "contact", "FR76"]) expect(text.toLowerCase()).not.toContain(secret.toLowerCase());
    roles = new Set(["OBSERVER"]);
    expect((await A_("export_ticketing_event").run({ event: "tk-1" } as never, ctx)).structured.done).toBe(false);
  });

  it("export qui ne se relirait pas : refusé plutôt que livré", async () => {
    svc.buildEventExport.mockResolvedValueOnce({ ...EXPORT(), version: 7 } as never);
    expect((await A_("export_ticketing_event").run({ event: "tk-1" } as never, ctx)).text).toContain("Export impossible");
  });
});

describe("import", () => {
  it("aperçu : résumé, brouillon ; confirmation : service appelé dans l'église de la connexion (autre que la source)", async () => {
    const p = await preview("import_ticketing_event", { data: EXPORT() });
    expect(p.text).toContain("en brouillon dans cette église");
    expect(p.text).toContain("1 option(s), 1 plat(s)");
    expect(svc.importEvent).not.toHaveBeenCalled();
    const done = await confirm("import_ticketing_event");
    expect(done.structured.done).toBe(true);
    expect(svc.importEvent).toHaveBeenCalledWith("c1", "user-1", expect.objectContaining({ format: "koinonia-ticketing-event" }));
    expect(done.text).toContain("tk-9");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "tk-9", details: { imported: true } }));
  });

  it("JSON invalide refusé dès l'aperçu, sans jeton : version, champ inconnu, donnée personnelle, bornes", async () => {
    const bad: Record<string, unknown>[] = [
      { ...EXPORT(), version: 2 },
      { ...EXPORT(), bookings: [{ email: "a@b.fr" }] },
      { ...EXPORT(), event: { ...EXPORT().event, paymentMethods: { cash: true, cheque: false, transfer: { iban: "FR76", holder: "x" } } } },
      { ...EXPORT(), event: { ...EXPORT().event, capacity: 0 } },
      { ...EXPORT(), assets: [] },
      { nimporte: "quoi" },
    ];
    for (const data of bad) expect((await preview("import_ticketing_event", { data })).structured.done, JSON.stringify(data).slice(0, 60)).toBe(false);
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("réservé à ticketing:manage", async () => {
    manager = false;
    expect((await preview("import_ticketing_event", { data: EXPORT() })).structured.done).toBe(false);
    expect(A_("import_ticketing_event_preview").available(viewerFor("STAR", { predicates: ["ticketing"] }))).toBe(false);
    expect(A_("import_ticketing_event_preview").available(ctx.viewer)).toBe(true);
  });

  it("la confirmation revalide le JSON stocké ; un manager perdu entre-temps est refusé", async () => {
    await preview("import_ticketing_event", { data: EXPORT() });
    manager = false;
    expect((await confirm("import_ticketing_event")).structured.done).toBe(false);
    expect(svc.importEvent).not.toHaveBeenCalled();
  });
});
