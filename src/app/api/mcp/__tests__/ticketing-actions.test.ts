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

const MATRIX: Record<string, string[]> = {
  configure: ["ORGANIZER"],
  payments: ["ORGANIZER", "TREASURER"],
  reception: ["ORGANIZER", "RECEPTION"],
  catering: ["ORGANIZER", "CATERING"],
  menu: ["ORGANIZER", "CATERING"],
  read: ["ORGANIZER", "TREASURER", "RECEPTION", "CATERING", "OBSERVER"],
};
let roles = new Set<string>(["ORGANIZER"]);
let eventChurch = "c1";
let manager = false;
const EVENTS = [
  { id: "tk-1", title: "Nuit de la traversée", startsAt: new Date("2099-12-31T19:00:00Z"), status: "DRAFT", seatsTaken: 0, seatsOpen: 100, capacity: 150 },
  { id: "tk-2", title: "Concert", startsAt: new Date("2099-06-01T18:00:00Z"), status: "OPEN", seatsTaken: 0, seatsOpen: 50, capacity: 50 },
  { id: "tk-3", title: "Concert", startsAt: new Date("2099-07-01T18:00:00Z"), status: "OPEN", seatsTaken: 0, seatsOpen: 50, capacity: 50 },
];
const detail = {
  id: "tk-1",
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
vi.mock("@/modules/ticketing", () => ({
  isTicketingManager: vi.fn(async () => manager),
  listEvents: vi.fn(async () => EVENTS),
  getEventAccess: vi.fn(async (_s: unknown, id: string) => ({ eventId: id, churchId: eventChurch, status: "DRAFT", manager, roles })),
  canDo: (access: { roles: Set<string> }, action: string) => MATRIX[action].some((r) => access.roles.has(r)),
  getEventDetail: vi.fn(async () => detail),
  listTeam: vi.fn(async () => ({ posts: [{ id: "p1", name: "Porte" }], assignments: [{ id: "a1", name: "benevole@exemple.fr", postId: "p1", startsAt: null, endsAt: null }] })),
  listBookings: vi.fn(async () => [
    { id: "b1", reference: "NDT-001", status: "ACTIVE", contact: { name: "Jean Dupont", email: null, phone: null }, participants: [{ id: "pa1", firstName: "Jean", lastName: "Dupont", ageGroup: "ADULT", status: "ACTIVE" }], balances: { due: 15 } },
  ]),
  getPresence: vi.fn(async () => ({ capacity: 150, counts: { total: 2 }, level: "ok", anomalies: 0, unaccompanied: [{ id: "x", name: "Léa", guardian: "M. X", phone: "0600000000" }] })),
  listChurchAccounts: vi.fn(async () => [
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
