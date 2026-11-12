/**
 * Tests — actions de planning des responsables (spec 081, lot 3a) : droit de la grille et
 * périmètre revérifiés, aperçu sans écriture, empreinte changée ⇒ refus, code de l'écran réutilisé.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { viewerFor } from "../../assistant/__tests__/viewers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const auth = {
  hasChurchPermission: vi.fn(async () => true),
  requireDepartmentAccess: vi.fn(),
  getUserDepartmentScope: vi.fn(() => ({ scoped: true, departmentIds: ["d1"] })),
};
vi.mock("@/lib/auth", () => auth);
const planning = {
  PLANNED_STATUSES: ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"],
  assertEventDepartment: vi.fn(),
  getPlanningAvailability: vi.fn(),
  listPendingWithdrawalsForSlot: vi.fn(async () => []),
  manualRelance: vi.fn(async () => ({ notified: 3 })),
};
vi.mock("@/modules/planning", () => planning);
const mcp = { createConfirmation: vi.fn(async () => ({ token: "kmx_tok", expiresAt: new Date("2099-01-01T00:05:00Z") })), consumeConfirmation: vi.fn(), publicOrigin: () => "https://koinonia.test" };
vi.mock("@/modules/mcp", () => mcp);
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
const savePlanning = vi.fn();
vi.mock("@/app/api/events/[eventId]/departments/[deptId]/planning/_core", () => ({ savePlanning: (...a: unknown[]) => savePlanning(...a) }));
const duplicatePlanning = vi.fn(async (..._a: unknown[]) => ({ copied: 4, departments: 1 }));
vi.mock("@/app/api/events/[eventId]/duplicate-planning/_core", () => ({ duplicatePlanning: (...a: unknown[]) => duplicatePlanning(...a) }));
const saveNotice = vi.fn();
vi.mock("@/app/api/departments/[departmentId]/notices/_core", () => ({ saveNotice: (...a: unknown[]) => saveNotice(...a) }));

const p = await import("../_actions/planning");
const { CHANGED, fingerprint } = await import("../_actions/common");

const session = { user: { id: "u1", isSuperAdmin: false, churchRoles: [{ churchId: "c1", role: "DEPARTMENT_HEAD" }] } };
const ctx = { session: session as never, churchId: "c1", viewer: viewerFor("DEPARTMENT_HEAD"), grantId: "g1" };
const EVENT = { id: "e1", churchId: "c1", title: "Culte ", date: new Date("2099-03-15T09:00:00Z"), planningDeadline: null };
const AV = (entries: [string, { state: string; source: string; busyElsewhere: string[] }][]) => ({
  members: new Map(entries),
  counts: { available: 1, ifNeeded: 0, noResponse: 2, unavailable: 1 },
});

beforeEach(() => {
  vi.clearAllMocks();
  auth.hasChurchPermission.mockResolvedValue(true);
  auth.requireDepartmentAccess.mockImplementation(() => undefined);
  prismaMock.event.findUnique.mockResolvedValue(EVENT);
  prismaMock.department.findUnique.mockResolvedValue({ id: "d1", name: "Son", ministry: { churchId: "c1" } });
  prismaMock.planning.findMany.mockResolvedValue([{ memberId: "m2", status: "EN_SERVICE" }]);
  planning.getPlanningAvailability.mockResolvedValue(
    AV([
      ["m1", { state: "AVAILABLE", source: "response", busyElsewhere: [] }],
      ["m2", { state: "UNAVAILABLE", source: "period", busyElsewhere: [] }],
    ])
  );
});

describe("outils proposés", () => {
  it("seulement avec planning:edit (Resp. département oui, Secrétaire et STAR non) ; lecture des tâches avec planning:department", () => {
    const names = (role: string) => p.PLANNING_ACTIONS.filter((a) => a.available(viewerFor(role))).map((a) => a.name);
    expect(names("DEPARTMENT_HEAD")).toContain("fill_planning_confirm");
    expect(names("DEPARTMENT_HEAD")).toContain("assign_tasks_confirm");
    expect(names("SECRETARY")).toEqual(["planning_tasks"]);
    expect(names("STAR")).toEqual([]);
  });
});

describe("candidats", () => {
  it("ce que dit la grille, services sur 60 jours, identifiants ; jamais de coordonnée", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { member: { id: "m1", firstName: "Léa", lastName: "B" } },
      { member: { id: "m2", firstName: "Paul", lastName: "M" } },
    ]);
    prismaMock.planning.findMany
      .mockResolvedValueOnce([{ memberId: "m2", status: "EN_SERVICE" }])
      .mockResolvedValueOnce([{ memberId: "m1" }, { memberId: "m1" }]);
    const out = await p.planningCandidates({ eventId: "e1", departmentId: "d1" }, ctx);
    expect(out.text).toContain("Léa B [memberId m1] : disponible");
    expect(out.text).toContain("Paul M [memberId m2] : absent (absence déclarée)");
    expect(out.text).toContain("ni les compétences ni l'effectif");
    expect(out.structured.candidates).toEqual([
      expect.objectContaining({ memberId: "m1", servicesLast60Days: 2, absent: false }),
      expect.objectContaining({ memberId: "m2", status: "EN_SERVICE", absent: true }),
    ]);
    expect(JSON.stringify(out)).not.toMatch(/@|email|phone/);
  });

  it("hors périmètre, autre église ou sans planning:edit : refus sans donnée", async () => {
    auth.requireDepartmentAccess.mockImplementationOnce(() => {
      throw new Error("FORBIDDEN");
    });
    expect((await p.planningCandidates({ eventId: "e1", departmentId: "d1" }, ctx)).structured.done).toBe(false);
    prismaMock.event.findUnique.mockResolvedValueOnce({ ...EVENT, churchId: "autre" });
    expect((await p.planningCandidates({ eventId: "e1", departmentId: "d1" }, ctx)).text).toContain("périmètre");
    auth.hasChurchPermission.mockResolvedValueOnce(false);
    expect((await p.planningCandidates({ eventId: "e1", departmentId: "d1" }, ctx)).text).toContain("périmètre");
    expect(prismaMock.memberDepartment.findMany).not.toHaveBeenCalled();
  });
});

describe("remplir le planning", () => {
  const input = { eventId: "e1", departmentId: "d1", plannings: [{ memberId: "m1", status: "EN_SERVICE" as const }, { memberId: "m2", status: "REMPLACANT" as const }] };

  it("aperçu : changements et alertes de la grille, rien d'enregistré", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      { id: "m1", firstName: "Léa", lastName: "B" },
      { id: "m2", firstName: "Paul", lastName: "M" },
    ]);
    const out = await p.previewFillPlanning(input, ctx);
    expect(out.text).toContain("- Léa B : En service (disponible)");
    expect(out.text).toContain("- Paul M : En service → Remplaçant ⚠ (absent (absence déclarée))");
    expect(savePlanning).not.toHaveBeenCalled();
    expect(mcp.createConfirmation).toHaveBeenCalledWith("g1", "fill_planning", expect.objectContaining({ plannings: input.plannings, fp: expect.any(String) }));
  });

  it("aperçu refusé : STAR hors du département, deux débriefs, date limite passée", async () => {
    prismaMock.member.findMany.mockResolvedValue([{ id: "m1", firstName: "Léa", lastName: "B" }]);
    expect((await p.previewFillPlanning(input, ctx)).text).toContain("n'appartiennent pas");
    const debriefs = { ...input, plannings: input.plannings.map((x) => ({ ...x, status: "EN_SERVICE_DEBRIEF" as const })) };
    expect((await p.previewFillPlanning(debriefs, ctx)).text).toContain("débrief");
    prismaMock.event.findUnique.mockResolvedValueOnce({ ...EVENT, planningDeadline: new Date("2020-01-01") });
    expect((await p.previewFillPlanning(input, ctx)).text).toContain("date limite");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("confirmation : grille ou disponibilités changées depuis l'aperçu ⇒ refus, rien d'écrit", async () => {
    mcp.consumeConfirmation.mockResolvedValue({ eventId: "e1", departmentId: "d1", plannings: input.plannings, fp: "ancienne" });
    expect((await p.confirmFillPlanning({ confirmation: "kmx_tok" }, ctx)).text).toBe(CHANGED);
    expect(savePlanning).not.toHaveBeenCalled();
  });

  it("confirmation : même état ⇒ code de la grille, journalisé via mcp", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      { id: "m1", firstName: "Léa", lastName: "B" },
      { id: "m2", firstName: "Paul", lastName: "M" },
    ]);
    await p.previewFillPlanning(input, ctx);
    const payload = (mcp.createConfirmation.mock.calls[0] as unknown[])[2];
    mcp.consumeConfirmation.mockResolvedValue(payload);
    const out = await p.confirmFillPlanning({ confirmation: "kmx_tok" }, ctx);
    expect(savePlanning).toHaveBeenCalledWith(ctx.session, "c1", "e1", "d1", input.plannings, { via: "mcp" });
    expect(out.structured.done).toBe(true);
  });

  it("confirmation : périmètre perdu entre-temps ⇒ refus", async () => {
    mcp.consumeConfirmation.mockResolvedValue({ eventId: "e1", departmentId: "d1", plannings: input.plannings, fp: "x" });
    auth.requireDepartmentAccess.mockImplementationOnce(() => {
      throw new Error("FORBIDDEN");
    });
    expect((await p.confirmFillPlanning({ confirmation: "kmx_tok" }, ctx)).text).toContain("périmètre");
    expect(savePlanning).not.toHaveBeenCalled();
  });
});

describe("recopier, relancer, consignes", () => {
  const eventWith = (eventId: string, plannings: { memberId: string; status: string }[]) => ({
    ...EVENT,
    id: eventId,
    eventDepts: [{ departmentId: "d1", department: { name: "Son" }, plannings: plannings.map((x) => ({ ...x, member: { firstName: "Léa", lastName: "B" } })) }],
  });

  it("recopie : aperçu puis code de l'écran, journalisé via mcp ; plannings changés ⇒ refus", async () => {
    prismaMock.event.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "src" ? eventWith("src", [{ memberId: "m1", status: "EN_SERVICE" }]) : eventWith("dst", [])
    );
    const out = await p.previewCopyPlanning({ sourceEventId: "src", targetEventId: "dst" }, ctx);
    expect(out.text).toContain("- Son : Léa B (En service)");
    const payload = (mcp.createConfirmation.mock.calls[0] as unknown[])[2] as { fp: string };
    mcp.consumeConfirmation.mockResolvedValue(payload);
    await p.confirmCopyPlanning({ confirmation: "kmx_tok" }, ctx);
    expect(duplicatePlanning).toHaveBeenCalledWith(ctx.session, "c1", "src", "dst");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ via: "mcp", copied: 4 }) }));

    duplicatePlanning.mockClear();
    mcp.consumeConfirmation.mockResolvedValue({ ...payload, fp: fingerprint("autre") });
    expect((await p.confirmCopyPlanning({ confirmation: "kmx_tok" }, ctx)).text).toBe(CHANGED);
    expect(duplicatePlanning).not.toHaveBeenCalled();
  });

  it("relance : nombre sans nom ; déjà relancé aujourd'hui ⇒ refus ; confirmation ⇒ manualRelance", async () => {
    prismaMock.availabilityAsk.findUnique.mockResolvedValueOnce({ manualRelanceAt: new Date() });
    expect((await p.previewRemind({ eventId: "e1", departmentId: "d1" }, ctx)).text).toContain("déjà été relancés");
    prismaMock.availabilityAsk.findUnique.mockResolvedValue(null);
    prismaMock.memberDepartment.findMany.mockResolvedValue([{ memberId: "m1" }, { memberId: "m2" }]);
    const out = await p.previewRemind({ eventId: "e1", departmentId: "d1" }, ctx);
    expect(out.text).toContain("Jusqu'à 2 STAR sans réponse");
    expect(out.text).not.toContain("Léa");
    mcp.consumeConfirmation.mockResolvedValue({ eventId: "e1", departmentId: "d1" });
    expect((await p.confirmRemind({ confirmation: "kmx_tok" }, ctx)).text).toBe("Rappel envoyé à 3 STAR.");
    expect(planning.manualRelance).toHaveBeenCalledWith({ eventId: "e1", departmentId: "d1" });
  });

  it("consignes : consigne remplacée montrée ; modifiée entre-temps ⇒ refus ; sinon code de l'écran", async () => {
    prismaMock.departmentNotice.findUnique.mockResolvedValue({ content: "Arrivée 9h", updatedAt: new Date("2099-01-01") });
    const out = await p.previewNotice({ eventId: "e1", departmentId: "d1", content: "Arrivée 8h30, tenue noire" }, ctx);
    expect(out.text).toContain("Elle remplace la consigne actuelle : « Arrivée 9h »");
    const payload = (mcp.createConfirmation.mock.calls[0] as unknown[])[2];
    mcp.consumeConfirmation.mockResolvedValue(payload);
    prismaMock.departmentNotice.findUnique.mockResolvedValueOnce({ content: "Arrivée 10h", updatedAt: new Date("2099-01-02") });
    expect((await p.confirmNotice({ confirmation: "kmx_tok" }, ctx)).text).toBe(CHANGED);
    expect(saveNotice).not.toHaveBeenCalled();
    await p.confirmNotice({ confirmation: "kmx_tok" }, ctx);
    expect(saveNotice).toHaveBeenCalledWith(ctx.session, "c1", "d1", "e1", "Arrivée 8h30, tenue noire", { via: "mcp" });
  });
});
