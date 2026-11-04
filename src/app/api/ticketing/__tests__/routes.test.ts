import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSession } from "@/__mocks__/auth";

/** Rôles simulés de l'appelant sur `ev-1` ; `ev-x` est d'une autre église (404). */
let roles: string[] = ["ORGANIZER"];
const session = createSession({ id: "user-1" });
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(async () => session),
  getCurrentChurchId: vi.fn(async () => "church-1"),
  requireCurrentChurchPermission: vi.fn(async () => {
    if (!roles.includes("MANAGER")) throw new Error("FORBIDDEN");
    return { session, churchId: "church-1" };
  }),
}));

const ACTIONS: Record<string, string[]> = {
  configure: ["ORGANIZER"],
  payments: ["ORGANIZER", "TREASURER"],
  reception: ["ORGANIZER", "RECEPTION"],
  catering: ["ORGANIZER", "CATERING"],
  menu: ["ORGANIZER", "CATERING"],
  read: ["ORGANIZER", "TREASURER", "RECEPTION", "CATERING", "OBSERVER"],
};
async function accessFor(eventId: string) {
  const { ApiError } = await import("@/lib/errors");
  if (eventId !== "ev-1") throw new ApiError(404, "Événement introuvable");
  return { eventId, churchId: "church-1", status: "OPEN", manager: false, roles: new Set(roles) };
}
vi.mock("@/modules/ticketing/auth", () => ({
  canDo: (a: { roles: Set<string> }, action: string) => ACTIONS[action].some((r) => a.roles.has(r)),
  requireEventAction: async (eventId: string, action: string) => {
    const access = await accessFor(eventId);
    if (!ACTIONS[action].some((r) => access.roles.has(r))) throw new Error("FORBIDDEN");
    return { session, access };
  },
  requireEventRole: async (eventId: string, allowed: string[]) => {
    const access = await accessFor(eventId);
    if (!allowed.some((r) => access.roles.has(r))) throw new Error("FORBIDDEN");
    return { session, access };
  },
}));

let turnstileOk = true;
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn(async () => turnstileOk) }));
const rateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: (...a: unknown[]) => rateLimit(...a),
  getClientIp: () => "1.2.3.4",
  RATE_LIMIT_MUTATION: {},
  RATE_LIMIT_SENSITIVE: {},
}));

const publicEvent = { id: "ev-1", churchSlug: "icc", slug: "nuit", open: true };
const ticketing = {
  getPublicEvent: vi.fn(async (_c: string, slug: string) => (slug === "nuit" ? publicEvent : null)),
  createBooking: vi.fn(async () => ({ bookingId: "bk-1", reference: "NT30-0042", manageToken: "t".repeat(64) })),
  recoverBooking: vi.fn(async () => undefined),
  bookingIdFromManageToken: vi.fn(async (token: string) => {
    const { ApiError } = await import("@/lib/errors");
    if (token !== "a".repeat(64)) throw new ApiError(404, "Réservation introuvable");
    return "bk-1";
  }),
  getBookingView: vi.fn(async () => ({ id: "bk-1", event: { id: "ev-1" } })),
  patchBooking: vi.fn(async () => ({ message: "ok" })),
  declarePayment: vi.fn(async () => ({ id: "pay-1", amount: 18 })),
  getTicket: vi.fn(async () => {
    const { ApiError } = await import("@/lib/errors");
    throw new ApiError(404, "Billet introuvable");
  }),
  updateEvent: vi.fn(async () => ({ id: "ev-1" })),
  getEventDetail: vi.fn(async () => ({ id: "ev-1", roles: [] })),
  listBookings: vi.fn(async () => []),
  confirmPayment: vi.fn(async () => undefined),
  rejectPayment: vi.fn(async () => undefined),
  recordReceipt: vi.fn(async () => ({ id: "pay-2" })),
  createEvent: vi.fn(async () => ({ id: "ev-new" })),
  isTicketingManager: vi.fn(async () => false),
  listEvents: vi.fn(async () => []),
  receptionSnapshot: vi.fn(async () => ({ kind: "reception" })),
  cateringSnapshot: vi.fn(async () => ({ kind: "catering" })),
  applyOperations: vi.fn(async () => ({ results: [] })),
  updateVariant: vi.fn(async () => ({ id: "chicken" })),
  updateOption: vi.fn(async () => ({ id: "meal" })),
  listLabels: vi.fn(async () => []),
};
vi.mock("@/modules/ticketing", () => ticketing);

const pub = await import("../public/[churchSlug]/[eventSlug]/route");
const book = await import("../public/[churchSlug]/[eventSlug]/bookings/route");
const recover = await import("../public/[churchSlug]/[eventSlug]/recover/route");
const manage = await import("../public/bookings/[token]/route");
const pay = await import("../public/bookings/[token]/payment/route");
const ticket = await import("../public/tickets/[token]/route");
const events = await import("../events/route");
const event = await import("../events/[id]/route");
const bookings = await import("../events/[id]/bookings/route");
const payment = await import("../events/[id]/payments/[paymentId]/route");
const receipts = await import("../events/[id]/bookings/[bookingId]/receipts/route");
const snapshot = await import("../events/[id]/snapshot/route");
const sync = await import("../events/[id]/sync/route");
const variantRoute = await import("../events/[id]/variants/[variantId]/route");
const optionRoute = await import("../events/[id]/options/[optionId]/route");
const labels = await import("../events/[id]/labels/route");

const json = (url: string, body: unknown, method = "POST") =>
  new Request(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const slugs = (eventSlug = "nuit") => ({ params: Promise.resolve({ churchSlug: "icc", eventSlug }) });
const tok = (token: string) => ({ params: Promise.resolve({ token }) });
const ev = (id = "ev-1") => ({ params: Promise.resolve({ id }) });
const evPay = { params: Promise.resolve({ id: "ev-1", paymentId: "pay-1" }) };
const evBk = { params: Promise.resolve({ id: "ev-1", bookingId: "bk-1" }) };
const U = "http://localhost/api/ticketing";

const validBooking = {
  participants: [{ firstName: "Awa", lastName: "K", ageGroup: "ADULT", options: [] }],
  contact: { name: "Awa", email: "awa@example.org" },
  turnstileToken: "ok",
};

describe("routes publiques de la billetterie (spec 074)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    turnstileOk = true;
    roles = ["ORGANIZER"];
  });

  it("un événement brouillon ou inconnu répond 404", async () => {
    expect((await pub.GET(new Request(`${U}/public/icc/brouillon`), slugs("brouillon"))).status).toBe(404);
    expect((await pub.GET(new Request(`${U}/public/icc/nuit`), slugs())).status).toBe(200);
  });

  it("l'inscription exige Turnstile et est limitée en débit", async () => {
    turnstileOk = false;
    const res = await book.POST(json(`${U}/public/icc/nuit/bookings`, validBooking), slugs());
    expect(res.status).toBe(400);
    expect(ticketing.createBooking).not.toHaveBeenCalled();
    expect(rateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ prefix: "ticketing-book:1.2.3.4", max: 5 }));
  });

  it("l'inscription refuse les champs inconnus et un corps trop gros", async () => {
    expect((await book.POST(json(`${U}/public/icc/nuit/bookings`, { ...validBooking, admin: true }), slugs())).status).toBe(400);
    const big = new Request(`${U}/public/icc/nuit/bookings`, { method: "POST", body: "x", headers: { "content-length": String(100_000) } });
    expect((await book.POST(big, slugs())).status).toBe(413);
  });

  it("une inscription valide renvoie la référence et le lien de gestion", async () => {
    const res = await book.POST(json(`${U}/public/icc/nuit/bookings`, validBooking), slugs());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ reference: "NT30-0042", manageToken: "t".repeat(64) });
  });

  it("« Retrouver » répond pareil que l'email soit connu ou non", async () => {
    const a = await recover.POST(json(`${U}/public/icc/nuit/recover`, { email: "x@example.org", turnstileToken: "ok" }), slugs());
    const b = await recover.POST(json(`${U}/public/icc/inconnu/recover`, { email: "y@example.org", turnstileToken: "ok" }), slugs("inconnu"));
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual(await b.json());
  });

  it("un jeton de gestion inconnu répond 404, toujours le même message", async () => {
    const res = await manage.GET(new Request(`${U}/public/bookings/zzz`), tok("zzz"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Réservation introuvable" });
    expect((await pay.POST(json(`${U}/public/bookings/zzz/payment`, { method: "WERO" }), tok("zzz"))).status).toBe(404);
  });

  it("modification par jeton : validée par Zod (action inconnue refusée)", async () => {
    const t = "a".repeat(64);
    expect((await manage.PATCH(json(`${U}/public/bookings/${t}`, { action: "hack" }, "PATCH"), tok(t))).status).toBe(400);
    expect((await manage.PATCH(json(`${U}/public/bookings/${t}`, { action: "cancelBooking" }, "PATCH"), tok(t))).status).toBe(200);
  });

  it("« J'ai payé » n'accepte que Wero, Revolut ou virement", async () => {
    const t = "a".repeat(64);
    expect((await pay.POST(json(`${U}/public/bookings/${t}/payment`, { method: "CASH" }), tok(t))).status).toBe(400);
    expect((await pay.POST(json(`${U}/public/bookings/${t}/payment`, { method: "WERO" }), tok(t))).status).toBe(201);
  });

  it("un billet inconnu répond 404", async () => {
    expect((await ticket.GET(new Request(`${U}/public/tickets/x`), tok("x"))).status).toBe(404);
  });
});

describe("routes authentifiées de la billetterie (spec 074)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roles = ["ORGANIZER"];
  });

  it("créer un événement exige ticketing:manage", async () => {
    roles = [];
    expect((await events.POST(json(`${U}/events`, { title: "Nuit", startsAt: "2030-12-31T20:00:00Z", endsAt: "2031-01-01T06:00:00Z", capacity: 100 }))).status).toBe(403);
    roles = ["MANAGER"];
    expect((await events.POST(json(`${U}/events`, { title: "Nuit", startsAt: "2030-12-31T20:00:00Z", endsAt: "2031-01-01T06:00:00Z", capacity: 100 }))).status).toBe(201);
  });

  it("un événement d'une autre église répond 404", async () => {
    expect((await event.GET(new Request(`${U}/events/ev-x`), ev("ev-x"))).status).toBe(404);
  });

  it("paramétrer est réservé à l'organisateur, et validé par Zod", async () => {
    roles = ["TREASURER"];
    expect((await event.PATCH(json(`${U}/events/ev-1`, { title: "X" }, "PATCH"), ev())).status).toBe(403);
    roles = ["ORGANIZER"];
    expect((await event.PATCH(json(`${U}/events/ev-1`, { seatsOpen: -1 }, "PATCH"), ev())).status).toBe(400);
    expect((await event.PATCH(json(`${U}/events/ev-1`, { paymentMethods: { transfer: { iban: "FR00 1234", holder: "X" } } }, "PATCH"), ev())).status).toBe(400);
    expect((await event.PATCH(json(`${U}/events/ev-1`, { title: "Nuit 2030" }, "PATCH"), ev())).status).toBe(200);
  });

  it("l'accueil ne voit pas la liste des réservations ; l'observateur la voit sans coordonnées", async () => {
    roles = ["RECEPTION"];
    expect((await bookings.GET(new Request(`${U}/events/ev-1/bookings`), ev())).status).toBe(403);
    roles = ["OBSERVER"];
    expect((await bookings.GET(new Request(`${U}/events/ev-1/bookings`), ev())).status).toBe(200);
    expect(ticketing.listBookings).toHaveBeenCalledWith("ev-1", false);
  });

  it("confirmer un paiement : trésorier ou organisateur", async () => {
    roles = ["OBSERVER"];
    expect((await payment.PATCH(json(`${U}/events/ev-1/payments/pay-1`, { action: "confirm" }, "PATCH"), evPay)).status).toBe(403);
    roles = ["TREASURER"];
    expect((await payment.PATCH(json(`${U}/events/ev-1/payments/pay-1`, { action: "reject" }, "PATCH"), evPay)).status).toBe(400);
    expect((await payment.PATCH(json(`${U}/events/ev-1/payments/pay-1`, { action: "confirm" }, "PATCH"), evPay)).status).toBe(200);
  });

  it("l'encaissement est borné par le rôle : accueil → entrées", async () => {
    roles = ["RECEPTION"];
    await receipts.POST(json(`${U}/events/ev-1/bookings/bk-1/receipts`, { method: "CASH", charges: [{ type: "entry", id: "p1" }] }), evBk);
    expect(ticketing.recordReceipt).toHaveBeenCalledWith("ev-1", "bk-1", expect.anything(), "user-1", "entry");
    roles = ["OBSERVER"];
    expect((await receipts.POST(json(`${U}/events/ev-1/bookings/bk-1/receipts`, { method: "CASH", charges: [{ type: "entry", id: "p1" }] }), evBk)).status).toBe(403);
  });
});

describe("routes de terrain de la billetterie (spec 074, lot 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("instantané : accueil pour `reception`, restauration pour `catering`, sinon 403 ; paramètre validé", async () => {
    roles = ["RECEPTION"];
    expect((await snapshot.GET(new Request(`${U}/events/ev-1/snapshot?for=reception`), ev())).status).toBe(200);
    expect((await snapshot.GET(new Request(`${U}/events/ev-1/snapshot?for=catering`), ev())).status).toBe(403);
    expect((await snapshot.GET(new Request(`${U}/events/ev-1/snapshot?for=tout`), ev())).status).toBe(400);
    roles = ["TREASURER"];
    expect((await snapshot.GET(new Request(`${U}/events/ev-1/snapshot?for=reception`), ev())).status).toBe(403);
  });

  it("synchronisation : rôle de terrain requis, opérations validées par Zod", async () => {
    roles = ["OBSERVER"];
    const body = { deviceId: "device-123", clientTime: new Date().toISOString(), ops: [] };
    expect((await sync.POST(json(`${U}/events/ev-1/sync`, body), ev())).status).toBe(403);
    roles = ["RECEPTION"];
    expect((await sync.POST(json(`${U}/events/ev-1/sync`, { ...body, ops: [{ type: "passage", id: "x" }] }), ev())).status).toBe(400);
    expect((await sync.POST(json(`${U}/events/ev-1/sync`, body), ev())).status).toBe(200);
    expect(ticketing.applyOperations).toHaveBeenCalledWith("ev-1", expect.anything(), expect.objectContaining({ userId: "user-1" }));
  });
});

describe("routes de la restauration (spec 074, lot 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roles = ["CATERING"];
  });
  const variantParams = { params: Promise.resolve({ id: "ev-1", variantId: "chicken" }) };
  const optionParams = { params: Promise.resolve({ id: "ev-1", optionId: "meal" }) };

  it("la restauration compose le menu, mais ne touche ni au prix ni aux règles", async () => {
    expect((await variantRoute.PATCH(json(`${U}/events/ev-1/variants/chicken`, { allergens: "sésame", closed: true }, "PATCH"), variantParams)).status).toBe(200);
    expect((await variantRoute.PATCH(json(`${U}/events/ev-1/variants/chicken`, { price: 2 }, "PATCH"), variantParams)).status).toBe(400);
    expect((await optionRoute.PATCH(json(`${U}/events/ev-1/options/meal`, { price: 2 }, "PATCH"), optionParams)).status).toBe(403);
  });

  it("étiquettes : restauration ou organisation ; l'accueil n'y a pas accès", async () => {
    expect((await labels.GET(new Request(`${U}/events/ev-1/labels?set=changed`), ev())).status).toBe(200);
    roles = ["RECEPTION"];
    expect((await labels.GET(new Request(`${U}/events/ev-1/labels`), ev())).status).toBe(403);
  });
});
