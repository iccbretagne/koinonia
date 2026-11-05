import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSession } from "@/__mocks__/auth";

/** Accès simulé : compta (`manage`), Admin (`reopen`) ou aucun, dans `church-1` seulement. */
let role: "manage" | "reopen" | "none" = "manage";
const session = createSession({ id: "user-1" });
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(async () => session),
  getCurrentChurchId: vi.fn(async () => "church-1"),
}));
vi.mock("@/modules/treasury/auth", () => ({
  requireTreasuryAccess: async (c: string) => {
    if (role === "none" || c !== "church-1") throw new Error("FORBIDDEN");
    return { session, canReopen: role === "reopen" };
  },
  requireTreasuryReopen: async (c: string) => {
    if (role !== "reopen" || c !== "church-1") throw new Error("FORBIDDEN");
    return { session };
  },
}));
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: vi.fn(), RATE_LIMIT_MUTATION: {} }));

const treasury = {
  getLedger: vi.fn(async () => ({ lines: [] })),
  createEntry: vi.fn(async () => ({ id: "new" })),
  updateEntry: vi.fn(async () => ({ id: "e1" })),
  deleteEntry: vi.fn(async () => undefined),
  getEntryChurchId: vi.fn(async (id: string) => {
    if (id === "missing") return null;
    return id === "foreign" ? "church-2" : "church-1";
  }),
  createDeposit: vi.fn(async () => ({ id: "dep", amount: 10, cheques: 0 })),
  reopenMonth: vi.fn(async () => undefined),
};
vi.mock("@/modules/treasury", () => treasury);

const ledger = await import("../ledger/route");
const entries = await import("../entries/route");
const entry = await import("../entries/[id]/route");
const deposits = await import("../deposits/route");
const reopen = await import("../closures/[month]/route");

const URL_BASE = "http://localhost/api/accounting/tresorerie";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (url: string, body: unknown, method = "POST") =>
  new Request(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

async function multipart(url: string, data: unknown, method = "POST") {
  const form = new FormData();
  form.append("data", JSON.stringify(data));
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  return new Request(url, {
    method,
    body,
    headers: { "content-type": encoded.headers.get("content-type")!, "content-length": String(body.byteLength) },
  });
}

const line = { accountId: "caisse", direction: "IN", categoryId: "dimes", method: "CASH", amount: 10, date: "2026-11-02", label: "Dîme" };

describe("routes de la trésorerie (spec 076)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    role = "manage";
  });

  it("sans treasury:manage : 403, rien n'est lu ni écrit", async () => {
    role = "none";
    expect((await ledger.GET(new Request(`${URL_BASE}/ledger`))).status).toBe(403);
    expect((await entries.POST(await multipart(`${URL_BASE}/entries`, line))).status).toBe(403);
    expect(treasury.getLedger).not.toHaveBeenCalled();
    expect(treasury.createEntry).not.toHaveBeenCalled();
  });

  it("le registre lit l'église courante avec les filtres validés", async () => {
    const res = await ledger.GET(new Request(`${URL_BASE}/ledger?accountId=caisse&from=2026-10-01&method=CHEQUE`));
    expect(res.status).toBe(200);
    expect(treasury.getLedger).toHaveBeenCalledWith("church-1", { accountId: "caisse", from: "2026-10-01", method: "CHEQUE" });
    expect((await ledger.GET(new Request(`${URL_BASE}/ledger?method=BITCOIN`))).status).toBe(400);
  });

  it("une saisie est validée par Zod avant tout appel", async () => {
    expect((await entries.POST(await multipart(`${URL_BASE}/entries`, { ...line, amount: -5 }))).status).toBe(400);
    expect(treasury.createEntry).not.toHaveBeenCalled();
    expect((await entries.POST(await multipart(`${URL_BASE}/entries`, line))).status).toBe(201);
    expect(treasury.createEntry).toHaveBeenCalledWith("church-1", expect.objectContaining({ amount: 10 }), null, { id: "user-1" });
  });

  it("une ligne d'une autre église ou inconnue : 403 / 404, l'église de la ligne fait foi", async () => {
    expect((await entry.DELETE(new Request(`${URL_BASE}/entries/foreign`, { method: "DELETE" }), params("foreign"))).status).toBe(403);
    expect((await entry.DELETE(new Request(`${URL_BASE}/entries/missing`, { method: "DELETE" }), params("missing"))).status).toBe(404);
    expect(treasury.deleteEntry).not.toHaveBeenCalled();
    expect((await entry.DELETE(new Request(`${URL_BASE}/entries/e1`, { method: "DELETE" }), params("e1"))).status).toBe(200);
  });

  it("une remise vide est refusée", async () => {
    const res = await deposits.POST(json(`${URL_BASE}/deposits`, { accountId: "caisse", date: "2026-11-02", ref: "1", cashAmount: 0, chequeIds: [] }));
    expect(res.status).toBe(400);
    expect(treasury.createDeposit).not.toHaveBeenCalled();
  });

  it("rouvrir un mois : réservé à l'Admin, motif obligatoire", async () => {
    const req = (body: unknown) => new Request(`${URL_BASE}/closures/2026-10`, { method: "DELETE", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    const month = { params: Promise.resolve({ month: "2026-10" }) };
    expect((await reopen.DELETE(req({ reason: "Chèque oublié" }), month)).status).toBe(403);
    role = "reopen";
    expect((await reopen.DELETE(req({ reason: "" }), month)).status).toBe(400);
    expect((await reopen.DELETE(req({ reason: "Chèque oublié" }), month)).status).toBe(200);
    expect(treasury.reopenMonth).toHaveBeenCalledWith("church-1", "2026-10", "Chèque oublié", { id: "user-1" });
  });
});
