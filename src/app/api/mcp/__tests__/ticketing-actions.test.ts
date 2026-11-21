/**
 * Tests — billetterie par l'assistant IA (spec 083) : constructeur des actions (rôle d'événement
 * vérifié à l'aperçu et à la confirmation, église de l'événement, empreinte, jeton effacé, audit
 * « via mcp ») et lectures sans coordonnées ni IBAN en clair.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { viewerFor } from "../../assistant/__tests__/viewers";

const mcp = {
  createConfirmation: vi.fn(async (_g: string, _a: string, payload: unknown) => {
    stored = payload;
    return { token: "kmx_tok", expiresAt: new Date("2099-01-01T00:05:00Z") };
  }),
  consumeConfirmation: vi.fn(async () => stored),
  publicOrigin: () => "https://koinonia.test",
};
let stored: unknown = null;
vi.mock("@/modules/mcp", () => mcp);

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
// Matrice réelle du module : les tests suivent `EVENT_ACTIONS`, pas une copie.
const { EVENT_ACTIONS } = await import("@/modules/ticketing/auth");
const MATRIX = EVENT_ACTIONS as unknown as Record<string, string[]>;
let roles = new Set<string>(["ORGANIZER"]);
let eventChurch = "c1";
let manager = false;
const EVENTS = [
  { id: "tk-1", title: "Nuit de la traversée", startsAt: new Date("2099-12-31T19:00:00Z"), status: "DRAFT", seatsTaken: 0, seatsOpen: 100, capacity: 150 },
  { id: "tk-2", title: "Concert", startsAt: new Date("2099-06-01T18:00:00Z"), status: "OPEN", seatsTaken: 0, seatsOpen: 50, capacity: 50 },
  { id: "tk-3", title: "Concert", startsAt: new Date("2099-07-01T18:00:00Z"), status: "OPEN", seatsTaken: 0, seatsOpen: 50, capacity: 50 },
];
const baseDetail = {
  id: "tk-1",
  slug: "nuit",
  church: { slug: "icc" },
  updatedAt: new Date("2099-01-01T00:00:00Z"),
  title: "Nuit de la traversée",
  status: "DRAFT",
  startsAt: new Date("2099-12-31T19:00:00Z"),
  endsAt: new Date("2100-01-01T05:00:00Z"),
  location: null,
  description: null,
  capacity: 150,
  seatsOpen: 100,
  seatsTaken: 0,
  registrationDeadline: null,
  optionPaymentDeadline: null,
  tariffs: [{ ageGroup: "ADULT", price: 15 }],
  paymentMethods: { transfer: { iban: "FR7630006000011234567890189", holder: "Trésorerie NDT" }, cash: true, cheque: false },
  options: [],
  roles: [{ userId: "u9", role: "TREASURER", name: null, email: "tresorier@exemple.fr" }],
  posterKey: null,
  allowOnsitePayment: true,
  allowUnaccompaniedMinors: false,
  allowWalkIns: false,
  entryRefundable: false,
  entryRefundDeadline: null,
  reminderDaysBefore: 3,
  retentionDays: 365,
};
let detail: Record<string, unknown> = structuredClone(baseDetail);
const PAYMENTS = () => [
  { id: "pay1", bookingId: "b1", reference: "NDT-001", contactName: "Jean Dupont", kind: "DECLARATION", status: "PENDING", method: "WERO", amount: 15, reason: null },
  { id: "pay2", bookingId: "b2", reference: "NDT-002", contactName: "Awa Traoré", kind: "DECLARATION", status: "PENDING", method: "TRANSFER", amount: 30, reason: null },
  { id: "pay3", bookingId: "b3", reference: "NDT-003", contactName: "Paul Martin", kind: "DECLARATION", status: "PENDING", method: "PAYPAL", amount: 45, reason: null },
];
let payments = PAYMENTS();
const BOOKING = () => ({
  id: "b1",
  reference: "NDT-001",
  status: "ACTIVE",
  contact: { name: "Jean Dupont", email: "jean@exemple.fr", phone: "0600000000" },
  event: { id: "tk-1" },
  participants: [{ id: "pa1", firstName: "Jean", lastName: "Dupont", ageGroup: "ADULT", status: "ACTIVE", entryPrice: 15, entryStatus: "PAID", refundableNow: true }],
  items: [{ id: "i1", participantId: "pa1", optionId: "o1", label: "Repas", quantity: 1, amount: 10, status: "REFUND_DUE", active: true, refundableNow: false }],
  balances: { due: 0 },
});
let bookingView = BOOKING();
let team = { posts: [{ id: "p1", name: "Porte" }], assignments: [{ id: "a1", name: "benevole@exemple.fr", userId: "u5", guest: false, postId: "p1", postName: "Porte", startsAt: null, endsAt: null }] };
vi.mock("@/modules/ticketing", () => ({
  slugify: (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  createEvent: vi.fn(async (_c: string, _u: string, d: { title: string }) => ({ id: "tk-9", title: d.title, slug: "nuit" })),
  updateEvent: vi.fn(async () => ({ title: "Nuit de la traversée" })),
  createOption: vi.fn(async (_e: string, _u: string, d: { label: string }) => ({ id: "o9", label: d.label })),
  updateOption: vi.fn(async () => ({ id: "o1", label: "Repas" })),
  deleteOption: vi.fn(async () => ({ deleted: true })),
  addVariant: vi.fn(async (_e: string, _o: string, _u: string, d: { label: string }) => ({ id: "v9", label: d.label })),
  updateVariant: vi.fn(async () => ({ id: "v1", label: "Poulet" })),
  deleteVariant: vi.fn(async () => undefined),
  setRoles: vi.fn(async () => undefined),
  createPost: vi.fn(async () => ({ id: "p9", name: "Accueil" })),
  renamePost: vi.fn(async () => ({ id: "p1", name: "Entrée" })),
  deletePost: vi.fn(async () => undefined),
  createAssignment: vi.fn(async () => ({ id: "a9" })),
  updateAssignment: vi.fn(async () => ({ id: "a1" })),
  deleteAssignment: vi.fn(async () => undefined),
  listPayments: vi.fn(async () => payments),
  confirmPayment: vi.fn(async () => undefined),
  rejectPayment: vi.fn(async () => undefined),
  recordReceipt: vi.fn(async () => ({ id: "r1", amount: 15 })),
  markRefunded: vi.fn(async () => ({ id: "rf1", amount: 15 })),
  getBookingView: vi.fn(async () => bookingView),
  cancelByOrganizer: vi.fn(async () => ({ message: "Réservation annulée par l'organisation." })),
  applyOperations: vi.fn(async (_e: string, input: { ops: { id: string }[] }) => ({ results: input.ops.map((o) => ({ id: o.id, status: "applied" })) })),
  cateringBoard: vi.fn(async () => ({ toPrepare: [], notCollected: [], sales: { quantity: 0, amount: 0 } })),
  cateringSnapshot: vi.fn(async () => ({
    items: [{ id: "i1", holder: "Jean Dupont", label: "Repas — Poulet", quantity: 2, deliveredQty: 0, amountDue: 0 }],
    sale: [{ id: "o1", label: "Repas", price: 8, variants: [{ id: "v1", label: "Poulet" }] }],
  })),
  isTicketingManager: vi.fn(async () => manager),
  listEvents: vi.fn(async () => EVENTS),
  getEventAccess: vi.fn(async (_s: unknown, id: string) => ({ eventId: id, churchId: eventChurch, status: "DRAFT", manager, roles })),
  canDo: (access: { roles: Set<string> }, action: string) => MATRIX[action].some((r) => access.roles.has(r)),
  getEventDetail: vi.fn(async () => detail),
  listTeam: vi.fn(async () => team),
  listBookings: vi.fn(async () => [
    { id: "b1", reference: "NDT-001", status: "ACTIVE", contact: { name: "Jean Dupont", email: null, phone: null }, participants: [{ id: "pa1", firstName: "Jean", lastName: "Dupont", ageGroup: "ADULT", status: "ACTIVE" }], balances: { due: 15 } },
  ]),
  getPresence: vi.fn(async () => ({ capacity: 150, counts: { total: 2 }, level: "ok", anomalies: 0, unaccompanied: [{ id: "x", name: "Léa", guardian: "M. X", phone: "0600000000" }] })),
  listChurchAccounts: vi.fn(async () => [
    { id: "u5", name: "Marc Lévy", email: "marc@exemple.fr" },
    { id: "u1", name: "Awa Traoré", email: "awa@exemple.fr" },
    { id: "u2", name: null, email: "anonyme@exemple.fr" },
  ]),
}));
const logAudit = vi.fn();
const withAuditContext = vi.fn(async (_extra: unknown, fn: () => Promise<unknown>) => fn());
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a), withAuditContext: (e: unknown, f: () => Promise<unknown>) => withAuditContext(e, f) }));

const t = await import("../_actions/ticketing");
const { ApiError } = await import("@/lib/api-utils");

const ctx = { session: { user: { id: "user-1" } } as never, churchId: "c1", viewer: viewerFor("STAR", { predicates: ["ticketing"] }), grantId: "g1" };
const CHANGED_TEXT = "Les données ont changé depuis l'aperçu : refaites l'aperçu et montrez-le de nouveau avant de confirmer.";
const SENSITIVE = /@|0600000000|FR763000|30006000011234567890189/;

let version = 1;
const execute = vi.fn(async () => ({ text: "Fait." }));
const [preview, confirm] = t.eventAction({
  action: "demo_ticketing",
  role: "configure",
  description: "démo",
  confirmDescription: "démo",
  input: z.object({ event: t.eventRef, value: z.string() }),
  prepare: async (input, _ctx, event) => (input.value === "bad" ? "Valeur refusée." : { lines: [`${event!.title} → ${input.value}`], payload: { eventId: event!.id, value: input.value } }),
  state: async () => ({ version }),
  execute,
  audit: (p) => ({ action: "UPDATE", entityType: "TicketingEvent", entityId: p.eventId! }),
});
const run = (def: typeof preview, input: unknown) => def.run(input as never, ctx);

beforeEach(() => {
  vi.clearAllMocks();
  roles = new Set(["ORGANIZER"]);
  eventChurch = "c1";
  manager = false;
  version = 1;
  stored = null;
  detail = structuredClone(baseDetail);
  payments = PAYMENTS();
  bookingView = BOOKING();
  team = { posts: [{ id: "p1", name: "Porte" }], assignments: [{ id: "a1", name: "benevole@exemple.fr", userId: "u5", guest: false, postId: "p1", postName: "Porte", startsAt: null, endsAt: null }] };
});

describe("constructeur eventAction", () => {
  it("proposé à qui voit la billetterie, jamais à un STAR sans rôle ni module coupé", () => {
    expect(preview.available(ctx.viewer)).toBe(true);
    expect(preview.available(viewerFor("STAR"))).toBe(false);
    expect(preview.available(viewerFor("ADMIN", { predicates: ["ticketing"], modules: ["core"] }))).toBe(false);
    expect(preview.name).toBe("demo_ticketing_preview");
    expect(confirm.name).toBe("demo_ticketing_confirm");
  });

  it("aperçu : événement par titre, rien d'exécuté, jeton", async () => {
    const out = await run(preview, { event: "nuit de la traversee", value: "x" });
    expect(out.text).toContain("Nuit de la traversée → x");
    expect(out.structured.confirmation).toBe("kmx_tok");
    expect(execute).not.toHaveBeenCalled();
  });

  it("refus à l'aperçu : titre ambigu, autre église, rôle manquant, règle du métier", async () => {
    expect((await run(preview, { event: "Concert", value: "x" })).text).toContain("Plusieurs événements");
    eventChurch = "c2";
    expect((await run(preview, { event: "tk-1", value: "x" })).text).toContain("introuvable");
    eventChurch = "c1";
    roles = new Set(["OBSERVER"]);
    expect((await run(preview, { event: "tk-1", value: "x" })).text).toBe(t.NOT_ROLE);
    roles = new Set(["ORGANIZER"]);
    expect((await run(preview, { event: "tk-1", value: "bad" })).text).toBe("Valeur refusée.");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("confirmation : jeton effacé, exécution sous « via mcp », audit, lien", async () => {
    await run(preview, { event: "tk-1", value: "x" });
    const out = await run(confirm, { confirmation: "kmx_tok_123456" });
    expect(out.structured.done).toBe(true);
    expect(mcp.consumeConfirmation).toHaveBeenCalledWith("g1", "demo_ticketing", "kmx_tok_123456", expect.any(Date), { erase: true });
    expect(execute).toHaveBeenCalledWith({ eventId: "tk-1", value: "x" }, ctx);
    expect(withAuditContext).toHaveBeenCalledWith({ via: "mcp" }, expect.any(Function));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "TicketingEvent", entityId: "tk-1", churchId: "c1" }));
    expect(out.text).toContain("https://koinonia.test/billetterie/tk-1");
  });

  it("confirmation refusée : jeton expiré, rôle perdu, données changées, règle du service", async () => {
    stored = null;
    expect((await run(confirm, { confirmation: "kmx_tok_123456" })).text).toContain("expirée");
    await run(preview, { event: "tk-1", value: "x" });
    roles = new Set(["TREASURER"]);
    expect((await run(confirm, { confirmation: "kmx_tok_123456" })).text).toBe(t.NOT_ROLE);
    roles = new Set(["ORGANIZER"]);
    version = 2;
    expect((await run(confirm, { confirmation: "kmx_tok_123456" })).text).toContain("ont changé");
    version = 1;
    execute.mockRejectedValueOnce(new ApiError(400, "Déjà 12 inscrits"));
    expect((await run(confirm, { confirmation: "kmx_tok_123456" })).text).toContain("Déjà 12 inscrits");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rôle manager : réservé à ticketing:manage, sans événement", async () => {
    const [p] = t.eventAction({
      action: "demo_create",
      role: "manager",
      description: "",
      confirmDescription: "",
      input: z.object({ title: z.string() }),
      prepare: async (input) => ({ lines: [input.title], payload: { title: input.title } as { eventId?: string; title: string } }),
      state: async () => null,
      execute: async () => ({ text: "créé", eventId: "tk-9" }),
    });
    expect(p.available(viewerFor("ADMIN", { modules: ["ticketing"] }))).toBe(true);
    expect(p.available(viewerFor("STAR", { predicates: ["ticketing"] }))).toBe(false);
    expect((await p.run({ title: "Gala" } as never, ctx)).text).toContain("réservé");
    manager = true;
    expect((await p.run({ title: "Gala" } as never, ctx)).text).toContain("Gala");
  });
});

describe("lectures", () => {
  const read = (name: string, input: unknown) => t.TICKETING_READS.find((a) => a.name === name)!.run(input as never, ctx);

  it("détail : IBAN masqué, aucun email, points bloquants", async () => {
    const out = await read("ticketing_event", { event: "tk-1" });
    expect(out.text).toContain("FR76 •••• 0189");
    expect(out.text).toContain("Compte sans nom");
    expect(JSON.stringify(out)).not.toMatch(SENSITIVE);
    expect(out.structured.blocking).toEqual([]);
  });

  it("réservations, présence, comptes : jamais de coordonnées", async () => {
    for (const [name, input] of [
      ["ticketing_bookings", { event: "tk-1", search: "dupont" }],
      ["ticketing_presence", { event: "tk-1" }],
      ["ticketing_accounts", { event: "tk-1", search: "awa" }],
    ] as const) {
      expect(JSON.stringify(await read(name, input)), name).not.toMatch(SENSITIVE);
    }
    expect((await read("ticketing_bookings", { event: "tk-1", search: "NDT-001" })).structured.total).toBe(1);
    expect((await read("ticketing_presence", { event: "tk-1" })).structured.unaccompanied).toBe(1);
  });

  it("comptes : réservé à l'organisateur ; observateur refusé", async () => {
    roles = new Set(["OBSERVER"]);
    expect((await read("ticketing_accounts", { event: "tk-1", search: "awa" })).text).toBe(t.NOT_ROLE);
    expect((await read("ticketing_event", { event: "tk-1" })).structured.id).toBe("tk-1");
  });
});


// ─── Actions (spec 083, lots B à E) ──────────────────────────────────────────

const svc = (await import("@/modules/ticketing")) as unknown as Record<string, ReturnType<typeof vi.fn>>;
const A = (name: string) => t.TICKETING_ACTIONS.find((a) => a.name === name)!;
const TOKEN = { confirmation: "kmx_tok_123456" };
/** Aperçu puis confirmation (si l'aperçu a produit un jeton). */
async function full(action: string, input: unknown) {
  const p = await A(`${action}_preview`).run(input as never, ctx);
  const c = await A(`${action}_confirm`).run(TOKEN as never, ctx);
  return { p, c };
}
const noSecret = (...outs: unknown[]) => expect(JSON.stringify(outs)).not.toMatch(SENSITIVE);
const MENU = {
  id: "o1",
  label: "Repas",
  type: "CHOICE",
  scope: "PARTICIPANT",
  price: 10,
  active: true,
  pickup: true,
  used: 0,
  variants: [{ id: "v1", label: "Poulet", closed: false, used: 0, stock: null }],
};

describe("lot B : événement, état, options, plats", () => {
  it("parcours organisateur : créer, paramétrer, option, plat, ouvrir", async () => {
    manager = true;
    const created = await full("create_ticketing_event", { title: "Nuit de la traversée", startsAt: "2099-12-31 20:00", endsAt: "2100-01-01 06:00", capacity: 150 });
    expect(created.p.text).toContain("brouillon");
    expect(svc.createEvent).toHaveBeenCalledWith("c1", "user-1", expect.objectContaining({ title: "Nuit de la traversée", capacity: 150 }));
    expect(created.c.text).toContain("https://koinonia.test/inscription/icc/nuit");
    expect(created.c.text).toContain("https://koinonia.test/billetterie/tk-9");

    const updated = await full("update_ticketing_event", {
      event: "tk-1",
      changes: { capacity: 200, seatsOpen: 120, paymentMethods: { transfer: { iban: "FR76 3000 6000 0112 3456 7890 189", holder: "Trésorerie NDT" }, cash: true } },
    });
    expect(updated.p.text).toContain("Jauge : 150 → 200");
    expect(updated.p.text).toContain("FR76 •••• 0189");
    expect(svc.updateEvent).toHaveBeenCalledWith("tk-1", "user-1", expect.objectContaining({ capacity: 200, seatsOpen: 120, paymentMethods: expect.objectContaining({ cash: true }) }));
    noSecret(updated.p, updated.c);
    expect(JSON.stringify([updated.p, updated.c])).not.toContain("FR7630006000011234567890189");

    detail.options = [MENU];
    const option = await full("edit_ticketing_option", { event: "tk-1", op: "create", option: { label: "Repas", type: "CHOICE", scope: "PARTICIPANT", price: 12, pickup: true }, variants: ["Poulet", "Poisson"] });
    expect(svc.createOption).toHaveBeenCalledWith("tk-1", "user-1", expect.objectContaining({ label: "Repas", price: 12, variants: [{ label: "Poulet" }, { label: "Poisson" }] }));
    expect(option.c.structured.done).toBe(true);

    await full("edit_ticketing_dish", { event: "tk-1", op: "create", optionId: "o1", dish: { label: "Végétarien", stock: 20 } });
    expect(svc.addVariant).toHaveBeenCalledWith("tk-1", "o1", "user-1", expect.objectContaining({ label: "Végétarien", stock: 20 }));

    const opened = await full("set_ticketing_status", { event: "tk-1", op: "open" });
    expect(svc.updateEvent).toHaveBeenLastCalledWith("tk-1", "user-1", { status: "OPEN" });
    expect(opened.c.structured.done).toBe(true);
  });

  it("places sous les inscrits : le refus du service est propagé, rien d'autre", async () => {
    svc.updateEvent.mockRejectedValueOnce(new ApiError(400, "Déjà 12 inscrits : les places ouvertes ne descendent pas en dessous"));
    const { c } = await full("update_ticketing_event", { event: "tk-1", changes: { seatsOpen: 5 } });
    expect(c.text).toContain("Déjà 12 inscrits");
    expect(c.text).toContain("Rien n'est fait");
    expect(c.structured.done).toBe(false);
  });

  it("changement vide, date incohérente ou champ inconnu : refus à l'aperçu", async () => {
    expect((await A("update_ticketing_event_preview").run({ event: "tk-1", changes: {} } as never, ctx)).text).toBe("Aucun changement demandé.");
    expect((await A("update_ticketing_event_preview").run({ event: "tk-1", changes: { startsAt: "2099-12-31 20:00", endsAt: "2099-12-31 19:00" } } as never, ctx)).text).toContain("La fin doit suivre le début");
    expect((await A("update_ticketing_event_preview").run({ event: "tk-1", changes: { iban: "x" } } as never, ctx)).structured.done).toBe(false);
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("ouverture refusée avec un point bloquant ; clôture annonce la lecture seule", async () => {
    detail.tariffs = [];
    const refused = await A("set_ticketing_status_preview").run({ event: "tk-1", op: "open" } as never, ctx);
    expect(refused.text).toContain("Ouverture refusée");
    expect(refused.text).toContain("Tarifs de l'entrée");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
    detail = { ...structuredClone(baseDetail), status: "OPEN" };
    const archive = await A("set_ticketing_status_preview").run({ event: "tk-1", op: "archive" } as never, ctx);
    expect(archive.text).toContain("lecture seule");
    expect((await A("set_ticketing_status_preview").run({ event: "tk-1", op: "open" } as never, ctx)).text).toContain("Impossible");
  });

  it("restauration : édite un plat, pas l'événement ni ses options", async () => {
    roles = new Set(["CATERING"]);
    detail.options = [MENU];
    const { p, c } = await full("edit_ticketing_dish", { event: "tk-1", op: "update", variantId: "v1", dish: { closed: true } });
    expect(p.text).toContain("Fermé : non → oui");
    expect(svc.updateVariant).toHaveBeenCalledWith("tk-1", "v1", "user-1", { closed: true });
    expect(c.structured.done).toBe(true);
    for (const [name, input] of [
      ["update_ticketing_event", { event: "tk-1", changes: { capacity: 10 } }],
      ["edit_ticketing_option", { event: "tk-1", op: "delete", optionId: "o1" }],
      ["set_ticketing_status", { event: "tk-1", op: "open" }],
    ] as const) {
      expect((await A(`${name}_preview`).run(input as never, ctx)).text, name).toBe(t.NOT_ROLE);
    }
  });

  it("option déjà choisie : désactivée plutôt que supprimée, annoncé à l'aperçu", async () => {
    detail.options = [{ ...MENU, used: 3 }];
    const { p } = await full("edit_ticketing_option", { event: "tk-1", op: "delete", optionId: "o1" });
    expect(p.text).toContain("désactivée");
    expect(svc.deleteOption).toHaveBeenCalledWith("tk-1", "o1", "user-1");
  });
});

describe("lot C : équipe", () => {
  it("rôles : liste finale montrée, changement concurrent ⇒ CHANGED", async () => {
    const p = await A("set_ticketing_roles_preview").run({ event: "tk-1", userId: "u1", role: "RECEPTION", grant: true } as never, ctx);
    expect(p.text).toContain("Awa Traoré");
    expect(p.text).toContain("Compte sans nom");
    noSecret(p);
    detail.roles = [...(detail.roles as unknown[]), { userId: "u3", role: "OBSERVER", name: "Léa", email: "lea@exemple.fr" }];
    const c = await A("set_ticketing_roles_confirm").run(TOKEN as never, ctx);
    expect(c.text).toBe(CHANGED_TEXT);
    expect(svc.setRoles).not.toHaveBeenCalled();
  });

  it("rôles : attribuer puis retirer recalcule la liste complète", async () => {
    await full("set_ticketing_roles", { event: "tk-1", userId: "u1", role: "RECEPTION", grant: true });
    expect(svc.setRoles).toHaveBeenLastCalledWith("tk-1", "user-1", [
      { userId: "u9", role: "TREASURER" },
      { userId: "u1", role: "RECEPTION" },
    ]);
    await full("set_ticketing_roles", { event: "tk-1", userId: "u9", role: "TREASURER", grant: false });
    expect(svc.setRoles).toHaveBeenLastCalledWith("tk-1", "user-1", []);
    expect((await A("set_ticketing_roles_preview").run({ event: "tk-1", userId: "u9", role: "TREASURER", grant: true } as never, ctx)).text).toContain("a déjà");
    expect((await A("set_ticketing_roles_preview").run({ event: "tk-1", userId: "nobody", role: "OBSERVER", grant: true } as never, ctx)).text).toContain("introuvable");
  });

  it("postes et affectations : appellent les services de l'écran, sans email", async () => {
    await full("edit_ticketing_post", { event: "tk-1", op: "create", name: "Accueil" });
    expect(svc.createPost).toHaveBeenCalledWith("tk-1", "user-1", "Accueil");
    await full("edit_ticketing_post", { event: "tk-1", op: "rename", postId: "p1", name: "Entrée" });
    expect(svc.renamePost).toHaveBeenCalledWith("tk-1", "p1", "user-1", "Entrée");
    const created = await full("edit_ticketing_assignment", { event: "tk-1", op: "create", userId: "u5", postId: "p1", startsAt: "2099-12-31 19:00", endsAt: "2099-12-31 23:00" });
    expect(svc.createAssignment).toHaveBeenCalledWith("tk-1", "user-1", expect.objectContaining({ userId: "u5", postId: "p1" }));
    expect(created.p.text).toContain("Marc Lévy");
    const moved = await full("edit_ticketing_assignment", { event: "tk-1", op: "update", assignmentId: "a1", postId: null });
    expect(moved.p.text).toContain("Poste : Porte → (aucun)");
    expect(svc.updateAssignment).toHaveBeenCalledWith("tk-1", "a1", "user-1", { postId: null });
    await full("edit_ticketing_assignment", { event: "tk-1", op: "delete", assignmentId: "a1" });
    expect(svc.deleteAssignment).toHaveBeenCalledWith("tk-1", "a1", "user-1");
    noSecret(created, moved);
    expect((await A("edit_ticketing_assignment_preview").run({ event: "tk-1", op: "create", guestName: "X", userId: "u5" } as never, ctx)).structured.done).toBe(false);
  });
});

describe("lot D : paiements", () => {
  it("série de 3 déclarations confirmée en une fois, journalisée une à une", async () => {
    roles = new Set(["TREASURER"]);
    const { p, c } = await full("handle_ticketing_payments", { event: "tk-1", paymentIds: ["pay1", "pay2", "pay3"], decision: "confirm" });
    expect(p.text).toContain("NDT-001");
    expect(p.text).toContain("90,00 €");
    expect(svc.confirmPayment.mock.calls.map((x) => x[1])).toEqual(["pay1", "pay2", "pay3"]);
    expect(svc.confirmPayment).toHaveBeenCalledWith("tk-1", "pay1", "user-1");
    expect(logAudit).toHaveBeenCalledTimes(3);
    expect(c.text).toContain("3 déclaration(s) confirmée(s)");
  });

  it("un paiement déjà traité : rien n'est fait ; changé avant la confirmation : rien non plus", async () => {
    payments[1].status = "CONFIRMED";
    const refused = await A("handle_ticketing_payments_preview").run({ event: "tk-1", paymentIds: ["pay1", "pay2"], decision: "confirm" } as never, ctx);
    expect(refused.text).toContain("NDT-002");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
    payments[1].status = "PENDING";
    await A("handle_ticketing_payments_preview").run({ event: "tk-1", paymentIds: ["pay1", "pay2"], decision: "confirm" } as never, ctx);
    payments[1].status = "CONFIRMED";
    const c = await A("handle_ticketing_payments_confirm").run(TOKEN as never, ctx);
    expect(c.text).toBe(CHANGED_TEXT);
    expect(svc.confirmPayment).not.toHaveBeenCalled();
  });

  it("plus de 50 paiements refusés ; refus sans motif refusé ; refus avec motif transmis", async () => {
    const input = A("handle_ticketing_payments_preview").input;
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `pay${i}`);
    expect(input.safeParse({ event: "tk-1", paymentIds: ids(51), decision: "confirm" }).success).toBe(false);
    expect(input.safeParse({ event: "tk-1", paymentIds: ids(50), decision: "confirm" }).success).toBe(true);
    expect(input.safeParse({ event: "tk-1", paymentIds: [], decision: "confirm" }).success).toBe(false);
    expect((await A("handle_ticketing_payments_preview").run({ event: "tk-1", paymentIds: ["pay1"], decision: "reject" } as never, ctx)).structured.done).toBe(false);
    await full("handle_ticketing_payments", { event: "tk-1", paymentIds: ["pay1"], decision: "reject", reason: "Montant incorrect" });
    expect(svc.rejectPayment).toHaveBeenCalledWith("tk-1", "pay1", "user-1", "Montant incorrect");
  });

  it("arrêt au milieu d'une série : dit combien sont faites", async () => {
    svc.confirmPayment.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ApiError(409, "Cette déclaration est déjà traitée."));
    const { c } = await full("handle_ticketing_payments", { event: "tk-1", paymentIds: ["pay1", "pay2", "pay3"], decision: "confirm" });
    expect(c.text).toContain("1 sur 3");
    expect(svc.confirmPayment).toHaveBeenCalledTimes(2);
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  it("encaissement : périmètre de l'accueil (entrées) et de la restauration (retraits)", async () => {
    bookingView.participants[0].entryStatus = "DUE";
    roles = new Set(["RECEPTION"]);
    const ok = await full("record_ticketing_receipt", { event: "tk-1", bookingId: "b1", method: "CASH", charges: [{ type: "entry", id: "pa1" }] });
    expect(svc.recordReceipt).toHaveBeenCalledWith("tk-1", "b1", { method: "CASH", charges: [{ type: "entry", id: "pa1" }], opId: expect.any(String) }, "user-1", "entry");
    noSecret(ok);
    roles = new Set(["CATERING"]);
    expect((await A("record_ticketing_receipt_preview").run({ event: "tk-1", bookingId: "b1", method: "CASH", charges: [{ type: "entry", id: "pa1" }] } as never, ctx)).text).toContain("hors de votre périmètre");
    roles = new Set(["OBSERVER"]);
    expect((await A("record_ticketing_receipt_preview").run({ event: "tk-1", bookingId: "b1", method: "CASH", charges: [{ type: "entry", id: "pa1" }] } as never, ctx)).text).toBe(t.NOT_ROLE);
  });

  it("remboursement : seulement les éléments à rembourser, par le trésorier", async () => {
    roles = new Set(["TREASURER"]);
    expect((await A("mark_ticketing_refunded_preview").run({ event: "tk-1", bookingId: "b1", method: "CASH", charges: [{ type: "entry", id: "pa1" }] } as never, ctx)).text).toContain("impossible");
    const { c } = await full("mark_ticketing_refunded", { event: "tk-1", bookingId: "b1", method: "TRANSFER", charges: [{ type: "item", id: "i1" }] });
    expect(svc.markRefunded).toHaveBeenCalledWith("tk-1", "b1", { method: "TRANSFER", charges: [{ type: "item", id: "i1" }] }, "user-1");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "TicketingPayment", churchId: "c1" }));
    noSecret(c);
    const other = { ...bookingView, event: { id: "tk-2" } };
    bookingView = other as never;
    expect((await A("mark_ticketing_refunded_preview").run({ event: "tk-1", bookingId: "b1", method: "CASH", charges: [{ type: "item", id: "i1" }] } as never, ctx)).text).toBe("Réservation introuvable");
  });

  it("lectures de règlement : paiements pour la trésorerie, réservation sans coordonnées", async () => {
    roles = new Set(["TREASURER"]);
    const pay = await t.TICKETING_READS.find((a) => a.name === "ticketing_payments")!.run({ event: "tk-1" } as never, ctx);
    expect(pay.text).toContain("[pay1]");
    const booking = await t.TICKETING_READS.find((a) => a.name === "ticketing_booking")!.run({ event: "tk-1", bookingId: "b1" } as never, ctx);
    expect(booking.text).toContain("[item:i1]");
    noSecret(pay, booking);
    roles = new Set(["OBSERVER"]);
    expect((await t.TICKETING_READS.find((a) => a.name === "ticketing_payments")!.run({ event: "tk-1" } as never, ctx)).text).toBe(t.NOT_ROLE);
    const seen = await t.TICKETING_READS.find((a) => a.name === "ticketing_booking")!.run({ event: "tk-1", bookingId: "b1" } as never, ctx);
    expect(seen.structured.charges).toEqual([]);
  });
});

describe("lot E : réservations et restauration", () => {
  it("annulation : montre ce qui sera à rembourser, prévient le contact, journalise", async () => {
    roles = new Set(["TREASURER"]);
    const { p, c } = await full("cancel_ticketing_booking", { event: "tk-1", bookingId: "b1" });
    expect(p.text).toContain("À rembourser ensuite : 15,00 €");
    expect(svc.cancelByOrganizer).toHaveBeenCalledWith("b1", null);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "TicketingBooking", entityId: "b1" }));
    noSecret(p, c);
    await full("cancel_ticketing_booking", { event: "tk-1", bookingId: "b1", participantId: "pa1" });
    expect(svc.cancelByOrganizer).toHaveBeenLastCalledWith("b1", "pa1");
  });

  it("ajout sur place : refusé si non autorisé, sinon par la synchronisation de l'écran", async () => {
    roles = new Set(["RECEPTION"]);
    const input = { event: "tk-1", participants: [{ firstName: "Léa", lastName: "Durand", ageGroup: "ADULT" }], method: "CASH" };
    expect((await A("add_ticketing_walkin_preview").run(input as never, ctx)).text).toContain("n'est pas autorisé");
    detail.allowWalkIns = true;
    detail.status = "OPEN";
    const { c } = await full("add_ticketing_walkin", input);
    expect(svc.applyOperations).toHaveBeenCalledWith(
      "tk-1",
      expect.objectContaining({ ops: [expect.objectContaining({ type: "walkin", enter: true, method: "CASH" })] }),
      { userId: "user-1", roles }
    );
    expect(c.structured.done).toBe(true);
    svc.applyOperations.mockResolvedValueOnce({ results: [{ id: "x", status: "rejected", reason: "Jauge atteinte." }] });
    expect((await full("add_ticketing_walkin", input)).c.text).toContain("Jauge atteinte.");
  });

  it("restauration : remise (encaissement si dû) et vente sur place", async () => {
    roles = new Set(["CATERING"]);
    const del = await full("ticketing_catering_sale", { event: "tk-1", op: "deliver", itemId: "i1" });
    expect(del.p.text).toContain("2 sur 2");
    expect(svc.applyOperations).toHaveBeenLastCalledWith("tk-1", expect.objectContaining({ ops: [expect.objectContaining({ type: "delivery", itemId: "i1", delivered: 2 })] }), expect.anything());
    const sale = await full("ticketing_catering_sale", { event: "tk-1", op: "sale", optionId: "o1", variantId: "v1", quantity: 3, method: "CASH" });
    expect(sale.p.text).toContain("24,00 €");
    expect(svc.applyOperations).toHaveBeenLastCalledWith("tk-1", expect.objectContaining({ ops: [expect.objectContaining({ type: "onsiteSale", quantity: 3 })] }), expect.anything());
    expect((await A("ticketing_catering_sale_preview").run({ event: "tk-1", op: "sale", optionId: "o1", quantity: 1, method: "CASH" } as never, ctx)).text).toContain("Choisissez le plat");
    const catering = await t.TICKETING_READS.find((a) => a.name === "ticketing_catering")!.run({ event: "tk-1" } as never, ctx);
    expect((catering.structured.toDeliver as { id: string }[])[0].id).toBe("i1");
    noSecret(del, sale, catering);
  });
});

describe("matrice des rôles", () => {
  const ALL = ["ORGANIZER", "TREASURER", "RECEPTION", "CATERING", "OBSERVER"];
  const entry = { event: "tk-1", bookingId: "b1", method: "CASH", charges: [{ type: "entry", id: "pa1" }] };
  const TABLE: [string, string[], unknown][] = [
    ["update_ticketing_event", MATRIX.configure, { event: "tk-1", changes: { capacity: 10 } }],
    ["set_ticketing_status", MATRIX.configure, { event: "tk-1", op: "close" }],
    ["edit_ticketing_option", MATRIX.configure, { event: "tk-1", op: "delete", optionId: "zz" }],
    ["edit_ticketing_dish", MATRIX.menu, { event: "tk-1", op: "delete", variantId: "zz" }],
    ["set_ticketing_roles", MATRIX.configure, { event: "tk-1", userId: "u1", role: "OBSERVER", grant: true }],
    ["edit_ticketing_post", MATRIX.configure, { event: "tk-1", op: "delete", postId: "zz" }],
    ["edit_ticketing_assignment", MATRIX.configure, { event: "tk-1", op: "delete", assignmentId: "zz" }],
    ["handle_ticketing_payments", MATRIX.payments, { event: "tk-1", paymentIds: ["pay1"], decision: "confirm" }],
    ["record_ticketing_receipt", [...MATRIX.payments, "RECEPTION", "CATERING"], entry],
    ["mark_ticketing_refunded", MATRIX.payments, entry],
    ["cancel_ticketing_booking", MATRIX.payments, { event: "tk-1", bookingId: "b1" }],
    ["add_ticketing_walkin", MATRIX.reception, { event: "tk-1", participants: [{ firstName: "A", lastName: "B", ageGroup: "ADULT" }] }],
    ["ticketing_catering_sale", MATRIX.catering, { event: "tk-1", op: "sale", optionId: "o1", variantId: "v1", quantity: 1, method: "CASH" }],
  ];

  it.each(TABLE)("%s : seuls les rôles de la matrice passent", async (name, allowed, input) => {
    for (const role of [...ALL, "AUCUN"]) {
      roles = new Set(role === "AUCUN" ? [] : [role]);
      const out = await A(`${name}_preview`).run(input as never, ctx);
      expect(out.text === t.NOT_ROLE, `${name} / ${role}`).toBe(!allowed.includes(role));
    }
  });

  it("création : réservée à ticketing:manage ; aucune action pour un STAR sans rôle ni module coupé", async () => {
    const create = { title: "Gala", startsAt: "2099-05-01 19:00", endsAt: "2099-05-01 23:00", capacity: 10 };
    expect((await A("create_ticketing_event_preview").run(create as never, ctx)).text).toContain("réservé");
    manager = true;
    expect((await A("create_ticketing_event_preview").run(create as never, ctx)).structured.confirmation).toBe("kmx_tok");
    const names = t.TICKETING_ACTIONS.filter((a) => a.kind !== "read").map((a) => a.name);
    expect(names).toHaveLength(28);
    for (const a of t.TICKETING_ACTIONS) {
      expect(a.available(viewerFor("STAR")), a.name).toBe(false);
      expect(a.available(viewerFor("ADMIN", { predicates: ["ticketing"], modules: ["core"] })), a.name).toBe(false);
    }
    expect(A("create_ticketing_event_preview").available(viewerFor("STAR", { predicates: ["ticketing"] }))).toBe(false);
    expect(A("update_ticketing_event_preview").available(viewerFor("STAR", { predicates: ["ticketing"] }))).toBe(true);
  });
});
