/**
 * Tests — actions pour un STAR et compte rendu (spec 081, lot 3b) : droits et périmètre de
 * l'écran, aperçu sans écriture, code de l'écran à la confirmation, compte rendu modifié ⇒ refus.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { viewerFor } from "../../assistant/__tests__/viewers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const perms = new Set<string>();
const auth = {
  hasChurchPermission: vi.fn(async (_s: unknown, p: string) => perms.has(p)),
  getUserDepartmentScope: vi.fn(() => ({ scoped: true, departmentIds: ["d1"] })),
  requireDepartmentAccess: vi.fn(),
};
vi.mock("@/lib/auth", () => auth);
const planning = {
  findWithdrawableServicesForAbsence: vi.fn(async () => []),
  getMemberScope: vi.fn(async () => ({ churchId: "c1", departmentIds: ["d1"] })),
  listMemberAvailability: vi.fn(),
  listLinkedMemberIds: vi.fn(async () => []),
};
vi.mock("@/modules/planning", () => planning);
const mcp = { createConfirmation: vi.fn(async () => ({ token: "kmx_tok", expiresAt: new Date("2099-01-01T00:05:00Z") })), consumeConfirmation: vi.fn(), publicOrigin: () => "https://koinonia.test" };
vi.mock("@/modules/mcp", () => mcp);
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
const declareAbsenceFor = vi.fn(async (..._a: unknown[]) => ({ id: "a1" }));
vi.mock("@/app/api/absences/_core", () => ({ declareAbsenceFor: (...a: unknown[]) => declareAbsenceFor(...a) }));
const resolveAvailabilityTarget = vi.fn();
const answerFor = vi.fn(async (..._a: unknown[]) => ({ updated: 1, alerts: 0, withdrawals: 0 }));
vi.mock("@/app/api/availability/_core", () => ({
  resolveAvailabilityTarget: (...a: unknown[]) => resolveAvailabilityTarget(...a),
  answerFor: (...a: unknown[]) => answerFor(...a),
}));
const saveReport = vi.fn();
vi.mock("@/app/api/events/[eventId]/report/_core", () => ({ saveReport: (...a: unknown[]) => saveReport(...a) }));

const d = await import("../_actions/delegate");
const r = await import("../_actions/report");
const { CHANGED } = await import("../_actions/common");
const { ApiError } = await import("@/lib/api-utils");

const ctx = { session: { user: { id: "u1", churchRoles: [] } } as never, churchId: "c1", viewer: viewerFor("DEPARTMENT_HEAD"), grantId: "g1" };
const FUTURE = "2099-03-14";

beforeEach(() => {
  vi.clearAllMocks();
  perms.clear();
  prismaMock.member.findUnique.mockResolvedValue({ firstName: "Marie", lastName: "K" });
});

describe("pour un STAR", () => {
  it("outils selon le droit de l'écran : absences:manage (Secrétaire compris), planning:edit", () => {
    const names = (role: string) => d.DELEGATE_ACTIONS.filter((a) => a.available(viewerFor(role))).map((a) => a.name);
    expect(names("SECRETARY")).toEqual(["stars_inScope", "declare_unavailability_for_preview", "declare_unavailability_for_confirm"]);
    expect(names("DEPARTMENT_HEAD")).toContain("answer_service_for_confirm");
    expect(names("STAR")).toEqual([]);
    expect(names("REPORTER")).toEqual([]);
  });

  it("absence : hors périmètre ou sans absences:manage ⇒ refus sans jeton", async () => {
    const input = { memberId: "m9", startDate: FUTURE, endDate: FUTURE };
    expect((await d.previewAbsenceFor(input, ctx)).structured.done).toBe(false);
    perms.add("absences:manage");
    planning.getMemberScope.mockResolvedValueOnce({ churchId: "c1", departmentIds: ["d7"] });
    expect((await d.previewAbsenceFor(input, ctx)).text).toContain("périmètre");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("absence : aperçu nominatif puis code de l'écran avec la permission revérifiée, journalisé via mcp", async () => {
    perms.add("absences:manage");
    const out = await d.previewAbsenceFor({ memberId: "m1", startDate: FUTURE, endDate: FUTURE, reason: "Voyage" }, ctx);
    expect(out.text).toContain("Absence saisie pour Marie K");
    expect(declareAbsenceFor).not.toHaveBeenCalled();
    mcp.consumeConfirmation.mockResolvedValue({ memberId: "m1", startDate: FUTURE, endDate: FUTURE, reason: "Voyage" });
    await d.confirmAbsenceFor({ confirmation: "kmx_tok" }, ctx);
    const [, data, requirePermission, details] = declareAbsenceFor.mock.calls[0];
    expect(data).toMatchObject({ churchId: "c1", memberId: "m1", allDepartments: true, reason: "Voyage" });
    expect(details).toEqual({ via: "mcp" });
    perms.delete("absences:manage");
    await expect((requirePermission as (p: string) => Promise<unknown>)("absences:manage")).rejects.toThrow("FORBIDDEN");
  });

  it("absence : périmètre perdu à la confirmation ⇒ refus lisible", async () => {
    mcp.consumeConfirmation.mockResolvedValue({ memberId: "m1", startDate: FUTURE, endDate: FUTURE, reason: null });
    declareAbsenceFor.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect((await d.confirmAbsenceFor({ confirmation: "kmx_tok" }, ctx)).text).toContain("périmètre");
  });

  it("réponse : seuls les départements du périmètre, saisie par un tiers annoncée, journalisée via mcp", async () => {
    resolveAvailabilityTarget.mockResolvedValue({ memberId: "m1", isSelf: false, allowedDepartmentIds: ["d1"] });
    planning.listMemberAvailability.mockResolvedValue({
      months: [],
      events: [
        {
          id: "e1",
          title: "Culte",
          date: new Date("2099-03-14T09:00:00Z"),
          departments: [{ departmentId: "d1", name: "Son" }, { departmentId: "d7", name: "Accueil" }],
          plannedIn: [{ departmentId: "d7", departmentName: "Accueil", withdrawable: true }],
        },
      ],
    });
    const out = await d.previewAnswerFor({ memberId: "m1", day: FUTURE, answer: "UNAVAILABLE" }, ctx);
    expect(out.text).toContain("saisie pour Marie K (la grille indiquera");
    expect(out.text).toContain("(Son)");
    expect(out.text).not.toContain("Accueil");
    mcp.consumeConfirmation.mockResolvedValue({ memberId: "m1", answer: "UNAVAILABLE", eventIds: ["e1"] });
    await d.confirmAnswerFor({ confirmation: "kmx_tok" }, ctx);
    expect(answerFor).toHaveBeenCalledWith(ctx.session, "c1", "m1", [{ eventId: "e1", answer: "UNAVAILABLE" }], expect.any(Function));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ forMemberId: "m1", via: "mcp" }) }));
  });

  it("réponse : STAR hors périmètre ⇒ refus du code de l'écran, sans jeton", async () => {
    resolveAvailabilityTarget.mockRejectedValue(new ApiError(403, "Ce STAR est hors de votre périmètre"));
    expect((await d.previewAnswerFor({ memberId: "m9", day: FUTURE, answer: "AVAILABLE" }, ctx)).text).toBe("Ce STAR est hors de votre périmètre");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });
});

describe("compte rendu", () => {
  const EVENT = { id: "e1", churchId: "c1", title: "Culte ", date: new Date("2099-03-14T09:00:00Z"), reportEnabled: true };
  const EXISTING = {
    speaker: null,
    messageTitle: null,
    notes: "Belle louange",
    decisions: null,
    updatedAt: new Date("2099-03-14T12:00:00Z"),
    sections: [{ departmentId: "dA", label: "Accueil", position: 0, stats: { hommes: 10, femmes: 12, enfants: 3 }, notes: null }],
  };

  beforeEach(() => {
    prismaMock.event.findUnique.mockResolvedValue(EVENT);
    prismaMock.eventReport.findUnique.mockResolvedValue(EXISTING);
    prismaMock.department.findMany.mockResolvedValue([{ id: "dA", name: "Accueil" }, { id: "dS", name: "Sainte-Cène" }]);
  });

  it("proposé avec reports:edit ou events:manage (Reporter, Secrétaire), pas au Resp. département", () => {
    const has = (role: string) => r.REPORT_ACTIONS[0].available(viewerFor(role));
    expect(has("REPORTER")).toBe(true);
    expect(has("SECRETARY")).toBe(true);
    expect(has("DEPARTMENT_HEAD")).toBe(false);
  });

  it("aperçu : rubriques fournies et ce qu'elles remplacent ; les autres sont gardées", async () => {
    perms.add("reports:edit");
    const out = await r.previewReport(
      { eventId: "e1", speaker: "Pasteur A", sections: [{ department: "accueil", stats: { hommes: 40, femmes: 50, enfants: 10 } }, { department: "Sainte-Cène", stats: { supportsUtilises: 80 } }] },
      ctx
    );
    expect(out.text).toContain("- Orateur : « Pasteur A » (avant : vide)");
    expect(out.text).toContain("- Accueil : hommes 40, femmes 50, enfants 10 (avant : hommes 10, femmes 12, enfants 3)");
    expect(out.text).toContain("- Sainte-Cène : supportsUtilises 80");
    const payload = (mcp.createConfirmation.mock.calls[0] as unknown[])[2] as { data: { notes: string; sections: { label: string; departmentId: string }[] } };
    expect(payload.data.notes).toBe("Belle louange");
    expect(payload.data.sections.map((s) => [s.label, s.departmentId])).toEqual([["Accueil", "dA"], ["Sainte-Cène", "dS"]]);
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("refus : sans droit, comptes rendus désactivés, département inconnu, plusieurs événements le même jour", async () => {
    expect((await r.previewReport({ eventId: "e1", speaker: "X" }, ctx)).text).toContain("ne pouvez pas");
    perms.add("reports:edit");
    prismaMock.event.findUnique.mockResolvedValueOnce({ ...EVENT, reportEnabled: false });
    expect((await r.previewReport({ eventId: "e1", speaker: "X" }, ctx)).text).toContain("pas activés");
    expect((await r.previewReport({ eventId: "e1", sections: [{ department: "Fanfare", stats: {} }] }, ctx)).text).toContain("Département inconnu");
    prismaMock.event.findMany.mockResolvedValue([EVENT, { ...EVENT, id: "e2", title: "Baptêmes" }]);
    expect((await r.previewReport({ day: FUTURE, speaker: "X" }, ctx)).text).toContain("[eventId e2]");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("confirmation : compte rendu modifié entre-temps ⇒ refus ; sinon code de l'écran via mcp", async () => {
    perms.add("reports:edit");
    await r.previewReport({ eventId: "e1", speaker: "Pasteur A" }, ctx);
    const payload = (mcp.createConfirmation.mock.calls[0] as unknown[])[2];
    mcp.consumeConfirmation.mockResolvedValue(payload);
    prismaMock.eventReport.findUnique.mockResolvedValueOnce({ ...EXISTING, notes: "Modifié par la Secrétaire" });
    expect((await r.confirmReport({ confirmation: "kmx_tok" }, ctx)).text).toBe(CHANGED);
    expect(saveReport).not.toHaveBeenCalled();
    await r.confirmReport({ confirmation: "kmx_tok" }, ctx);
    expect(saveReport).toHaveBeenCalledWith(ctx.session, EVENT, expect.objectContaining({ speaker: "Pasteur A", notes: "Belle louange" }), { via: "mcp" });
  });
});
