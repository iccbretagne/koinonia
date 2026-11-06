import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSession } from "@/__mocks__/auth";

/** Accès simulé : `manager`, `member` ou aucun, dans l'église `church-1` seulement. */
let role: "manager" | "member" | "none" = "member";
const session = createSession({ id: "user-1" });
const requireShuttleAccess = vi.fn(async (churchId: string) => {
  if (role === "none" || churchId !== "church-1") throw new Error("FORBIDDEN");
  return { session, manager: role === "manager", member: role === "member", hasTeam: true };
});
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(async () => session),
  getCurrentChurchId: vi.fn(async () => "church-1"),
}));
vi.mock("@/modules/shuttle/auth", () => ({
  requireShuttleAccess: (c: string) => requireShuttleAccess(c),
  requireShuttleManager: async (c: string) => {
    const a = await requireShuttleAccess(c);
    if (!a.manager) throw new Error("FORBIDDEN");
    return a;
  },
}));
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: vi.fn(), RATE_LIMIT_MUTATION: {} }));
vi.mock("@/lib/registry", () => ({ registry: { has: () => true } }));
const treasury = { getActiveTreasuryAccount: vi.fn(), assertTreasuryDateOpen: vi.fn() };
vi.mock("@/modules/treasury", () => treasury);

const shuttle = {
  createEntry: vi.fn(async () => ({ id: "new" })),
  updateEntry: vi.fn(async () => ({ id: "e1" })),
  deleteEntry: vi.fn(async () => undefined),
  getEntryChurchId: vi.fn(async (id: string) => (id === "foreign" ? "church-2" : id === "missing" ? null : "church-1")),
  loadShuttleEntry: vi.fn(async () => ({ receiptKey: "k", receiptName: "ticket.jpg", receiptMime: "image/jpeg" })),
  readReceipt: vi.fn(async () => Buffer.from([0xff, 0xd8, 0xff])),
  flagEntry: vi.fn(async () => ({ id: "e1", flagNote: "x" })),
  updateLowBalanceThreshold: vi.fn(async (_c: string, t: number | null) => ({ lowBalanceThreshold: t })),
};
vi.mock("@/modules/shuttle", () => shuttle);

const entries = await import("../entries/route");
const entry = await import("../entries/[id]/route");
const receipt = await import("../entries/[id]/receipt/route");
const flag = await import("../entries/[id]/flag/route");
const settings = await import("../settings/route");

const expense = { kind: "EXPENSE", amount: 62, date: "2026-11-02", category: "FUEL" };

async function multipart(url: string, data: unknown, method = "POST", withFile = true) {
  const form = new FormData();
  form.append("data", JSON.stringify(data));
  if (withFile) form.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "t.jpg", { type: "image/jpeg" }));
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  return new Request(url, {
    method,
    body,
    headers: { "content-type": encoded.headers.get("content-type")!, "content-length": String(body.byteLength) },
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const URL_BASE = "http://localhost/api/accounting/navette";

describe("routes du registre de la navette (spec 073)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    role = "member";
  });

  it("un membre déclare une dépense : 201, acteur non gestionnaire", async () => {
    const res = await entries.POST(await multipart(`${URL_BASE}/entries`, expense));
    expect(res.status).toBe(201);
    expect(shuttle.createEntry).toHaveBeenCalledWith(
      "church-1",
      expect.objectContaining({ kind: "EXPENSE", amount: 62 }),
      expect.any(File),
      { id: "user-1", name: expect.any(String), manager: false }
    );
  });

  it("hors équipe et hors compta : 403", async () => {
    role = "none";
    expect((await entries.POST(await multipart(`${URL_BASE}/entries`, expense))).status).toBe(403);
    expect(shuttle.createEntry).not.toHaveBeenCalled();
  });

  it("411 sans Content-Length, 413 au-delà de la limite, sans lire le corps", async () => {
    const missing = new Request(`${URL_BASE}/entries`, { method: "POST" });
    const readMissing = vi.spyOn(missing, "formData");
    expect((await entries.POST(missing)).status).toBe(411);
    const big = new Request(`${URL_BASE}/entries`, { method: "POST", headers: { "content-length": String(20 * 1024 * 1024) } });
    const readBig = vi.spyOn(big, "formData");
    expect((await entries.POST(big)).status).toBe(413);
    expect(readMissing).not.toHaveBeenCalled();
    expect(readBig).not.toHaveBeenCalled();
  });

  it("saisie invalide : 400", async () => {
    const res = await entries.POST(await multipart(`${URL_BASE}/entries`, { ...expense, amount: -5 }));
    expect(res.status).toBe(400);
  });

  it("une ligne d'une autre église est refusée, une ligne inconnue répond 404", async () => {
    expect((await entry.PATCH(await multipart(`${URL_BASE}/entries/foreign`, expense, "PATCH"), params("foreign"))).status).toBe(403);
    expect((await entry.DELETE(new Request(`${URL_BASE}/entries/missing`, { method: "DELETE" }), params("missing"))).status).toBe(404);
    expect(shuttle.updateEntry).not.toHaveBeenCalled();
  });

  it("le justificatif est servi avec son type et nosniff", async () => {
    const res = await receipt.GET(new Request(`${URL_BASE}/entries/e1/receipt`), params("e1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("signalement et réglages réservés à la compta", async () => {
    const json = (body: unknown, method = "PUT") =>
      new Request(`${URL_BASE}/x`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await flag.PUT(json({ note: "illisible" }), params("e1"))).status).toBe(403);
    expect((await settings.PUT(json({ lowBalanceThreshold: 50 }))).status).toBe(403);
    role = "manager";
    expect((await flag.PUT(json({ note: "illisible" }), params("e1"))).status).toBe(200);
    expect((await settings.PUT(json({ lowBalanceThreshold: 50 }))).status).toBe(200);
    expect(shuttle.updateLowBalanceThreshold).toHaveBeenCalledWith("church-1", 50, "user-1");
  });

  it("abondement remis depuis une caisse : compte et mois contrôlés dans la trésorerie (spec 076)", async () => {
    role = "manager";
    const funding = { kind: "FUNDING", amount: 300, date: "2026-11-02", paymentMethod: "CASH", treasuryAccountId: "caisse" };
    expect((await entries.POST(await multipart(`${URL_BASE}/entries`, funding, "POST", false))).status).toBe(201);
    expect(treasury.getActiveTreasuryAccount).toHaveBeenCalledWith("church-1", "caisse");
    expect(treasury.assertTreasuryDateOpen).toHaveBeenCalledWith("church-1", new Date("2026-11-02T00:00:00Z"));
    const { ApiError } = await import("@/lib/api-utils");
    treasury.assertTreasuryDateOpen.mockRejectedValueOnce(new ApiError(400, "Novembre 2026 est clôturé"));
    expect((await entries.POST(await multipart(`${URL_BASE}/entries`, funding, "POST", false))).status).toBe(400);
    expect(shuttle.createEntry).toHaveBeenCalledTimes(1);
  });
});
