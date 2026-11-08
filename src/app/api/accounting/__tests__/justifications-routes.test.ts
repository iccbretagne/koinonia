/**
 * Tests — spec 078 : routes des justificatifs (accès, Zod, compte de restitution).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import { createSession } from "@/__mocks__/auth";

let session: Session = createSession();
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(async () => session),
  getCurrentChurchId: vi.fn(async () => "church-1"),
}));
let treasuryActive = true;
vi.mock("@/lib/registry", () => ({
  rolePermissions: {
    ADMIN: ["accounting:view", "accounting:submit", "accounting:manage"],
    DEPARTMENT_HEAD: ["accounting:view", "accounting:submit"],
    STAR: [],
  },
  registry: { has: (m: string) => m !== "treasury" || treasuryActive },
}));

const accounting = {
  getAccountingDepartmentScope: vi.fn(async () => null as string[] | null),
  getJustification: vi.fn(async () => ({ id: "j-1" })),
  listJustifications: vi.fn(async () => []),
  submitJustification: vi.fn(async () => ({ id: "j-1" })),
  reviewJustification: vi.fn(async () => ({ id: "j-1" })),
  waiveJustification: vi.fn(async () => ({ id: "j-1" })),
  recordReturn: vi.fn(async () => ({ id: "j-1" })),
  getJustificationSettings: vi.fn(async () => ({ firstReminderDays: 7, reminderIntervalDays: 7 })),
  updateJustificationSettings: vi.fn(async () => ({ firstReminderDays: 5, reminderIntervalDays: 3 })),
};
vi.mock("@/modules/accounting", () => accounting);

const treasury = {
  getActiveTreasuryAccount: vi.fn(async () => ({ id: "caisse" })),
  assertTreasuryDateOpen: vi.fn(async () => undefined),
};
vi.mock("@/modules/treasury", () => treasury);

const list = await import("../justifications/route");
const detail = await import("../justifications/[id]/route");
const settings = await import("../justifications/settings/route");
const { ApiError } = await import("@/lib/api-utils");

const BASE = "http://localhost/api/accounting/justifications";
const params = { params: Promise.resolve({ id: "j-1" }) };
const patch = (body: unknown) => new Request(`${BASE}/j-1`, { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const role = (r: string) =>
  createSession({ churchRoles: [{ id: "r", churchId: "church-1", role: r as never, ministryId: null, church: { id: "church-1", name: "C", slug: "c" }, departments: [] }] });

describe("routes des justificatifs (spec 078)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session = createSession();
    treasuryActive = true;
  });

  it("sans droit comptable : 403", async () => {
    session = role("STAR");
    expect((await list.GET(new Request(BASE))).status).toBe(403);
    expect((await detail.GET(new Request(`${BASE}/j-1`), params)).status).toBe(403);
    expect(accounting.listJustifications).not.toHaveBeenCalled();
  });

  it("un rôle d'une autre église ne donne aucun droit ici", async () => {
    session = createSession({ churchRoles: [{ id: "r", churchId: "church-2", role: "ADMIN", ministryId: null, church: { id: "church-2", name: "C", slug: "c" }, departments: [] }] });
    expect((await list.GET(new Request(BASE))).status).toBe(403);
  });

  it("autre église ou hors périmètre : le 404 du service est rendu tel quel", async () => {
    accounting.getJustification.mockRejectedValueOnce(new ApiError(404, "Justification introuvable"));
    expect((await detail.GET(new Request(`${BASE}/j-1`), params)).status).toBe(404);
  });

  it("filtre de la liste validé par Zod", async () => {
    expect((await list.GET(new Request(`${BASE}?status=NOPE`))).status).toBe(400);
    expect((await list.GET(new Request(`${BASE}?status=AWAITING`))).status).toBe(200);
  });

  it("un responsable de département dépose mais ne décide pas", async () => {
    session = role("DEPARTMENT_HEAD");
    accounting.getAccountingDepartmentScope.mockResolvedValueOnce(["d"]).mockResolvedValueOnce(["d"]);
    expect((await detail.PATCH(patch({ action: "submit", spentAmount: 10, attachmentIds: ["a"] }), params)).status).toBe(200);
    expect((await detail.PATCH(patch({ action: "accept" }), params)).status).toBe(403);
    expect(accounting.reviewJustification).not.toHaveBeenCalled();
  });

  it("refus sans motif : 400 (Zod)", async () => {
    expect((await detail.PATCH(patch({ action: "reject", reason: "" }), params)).status).toBe(400);
    expect((await detail.PATCH(patch({ action: "unknown" }), params)).status).toBe(400);
  });

  it("restitution sur un mois clôturé refusée, rien n'est écrit", async () => {
    treasury.assertTreasuryDateOpen.mockRejectedValueOnce(new ApiError(400, "Mois clôturé"));
    const res = await detail.PATCH(patch({ action: "return", returnedAt: "2026-03-02T10:00:00.000Z", treasuryAccountId: "caisse" }), params);
    expect(res.status).toBe(400);
    expect(accounting.recordReturn).not.toHaveBeenCalled();
  });

  it("restitution sans compte : compte commun, trésorerie non consultée", async () => {
    treasuryActive = false;
    const res = await detail.PATCH(patch({ action: "return", returnedAt: "2026-03-02T10:00:00.000Z", treasuryAccountId: null }), params);
    expect(res.status).toBe(200);
    expect(treasury.getActiveTreasuryAccount).not.toHaveBeenCalled();
    expect(accounting.recordReturn).toHaveBeenCalledWith("j-1", expect.anything(), { returnedAt: new Date("2026-03-02T10:00:00.000Z"), treasuryAccountId: null });
  });

  it("réglages : compta seule, bornes validées", async () => {
    const put = (body: unknown) => new Request(`${BASE}/settings`, { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    expect((await settings.PUT(put({ firstReminderDays: 0, reminderIntervalDays: 7 }))).status).toBe(400);
    expect((await settings.PUT(put({ firstReminderDays: 5, reminderIntervalDays: 3 }))).status).toBe(200);
    session = role("DEPARTMENT_HEAD");
    expect((await settings.GET()).status).toBe(403);
  });
});
