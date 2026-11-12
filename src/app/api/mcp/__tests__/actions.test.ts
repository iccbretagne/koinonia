/**
 * Tests — actions confirmées des assistants IA (spec 081, lot 2) : aperçu sans écriture,
 * confirmation unique, droits revérifiés, journalisation « via l'assistant IA ».
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { viewerFor } from "../../assistant/__tests__/viewers";

const planning = {
  listLinkedMemberIds: vi.fn(),
  findWithdrawableServicesForAbsence: vi.fn(),
  declareAbsence: vi.fn(),
  listMemberAvailability: vi.fn(),
  saveResponses: vi.fn(),
};
vi.mock("@/modules/planning", () => planning);
const mcp = { createConfirmation: vi.fn(), consumeConfirmation: vi.fn(), publicOrigin: () => "https://koinonia.test" };
vi.mock("@/modules/mcp", () => mcp);
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const actions = await import("../_actions");
const { ApiError } = await import("@/lib/api-utils");

const ctx = {
  session: { user: { id: "u1" } } as never,
  churchId: "c1",
  viewer: viewerFor("STAR", { predicates: ["linkedStar"] }),
  grantId: "g1",
};
const FUTURE = "2099-03-14";

beforeEach(() => {
  vi.clearAllMocks();
  planning.listLinkedMemberIds.mockResolvedValue(["m1"]);
  planning.findWithdrawableServicesForAbsence.mockResolvedValue([]);
  mcp.createConfirmation.mockResolvedValue({ token: "kmx_tok", expiresAt: new Date("2099-03-01T10:05:00Z") });
});

describe("outils proposés", () => {
  it("seulement avec la portée write et une fiche STAR liée", () => {
    expect(actions.actionsFor(ctx.viewer, false)).toEqual([]);
    expect(actions.actionsFor(viewerFor("STAR"), true)).toEqual([]);
    expect(actions.actionsFor(ctx.viewer, true).map((a) => a.name)).toEqual([
      "declare_unavailability_preview",
      "declare_unavailability_confirm",
      "answer_service_preview",
      "answer_service_confirm",
    ]);
  });
});

describe("déclarer une absence", () => {
  it("aperçu : rien d'enregistré, services quittés annoncés, jeton lié à la connexion", async () => {
    planning.findWithdrawableServicesForAbsence.mockResolvedValue([
      { eventId: "e1", title: "Culte", date: new Date("2099-03-15T09:00:00Z"), departmentId: "d1", departmentName: "Son" },
    ]);
    const out = await actions.previewUnavailability({ startDate: FUTURE, endDate: "2099-03-16" }, ctx);
    expect(planning.declareAbsence).not.toHaveBeenCalled();
    expect(out.text).toContain("Aperçu — rien n'est encore enregistré.");
    expect(out.text).toContain("Culte (Son)");
    expect(out.text).toContain("Jeton : kmx_tok");
    expect(mcp.createConfirmation).toHaveBeenCalledWith("g1", "declare_unavailability", {
      memberId: "m1",
      startDate: FUTURE,
      endDate: "2099-03-16",
      reason: null,
    });
  });

  it("aperçu refusé : pas de fiche liée, dates inversées, période passée — aucun jeton", async () => {
    planning.listLinkedMemberIds.mockResolvedValueOnce([]);
    expect((await actions.previewUnavailability({ startDate: FUTURE, endDate: FUTURE }, ctx)).structured.done).toBe(false);
    expect((await actions.previewUnavailability({ startDate: FUTURE, endDate: "2099-03-01" }, ctx)).text).toContain("précède");
    expect((await actions.previewUnavailability({ startDate: "2020-01-01", endDate: "2020-01-02" }, ctx)).text).toContain("passée");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("confirmation : exécute le résumé figé par le service de l'application, journalisé via mcp", async () => {
    mcp.consumeConfirmation.mockResolvedValue({ memberId: "m1", startDate: FUTURE, endDate: FUTURE, reason: "Congés" });
    planning.declareAbsence.mockResolvedValue({ id: "a1" });
    const out = await actions.confirmUnavailability({ confirmation: "kmx_tok" }, ctx);
    expect(mcp.consumeConfirmation).toHaveBeenCalledWith("g1", "declare_unavailability", "kmx_tok");
    expect(planning.declareAbsence).toHaveBeenCalledWith(
      expect.objectContaining({ churchId: "c1", memberId: "m1", createdById: "u1", allDepartments: true, reason: "Congés", startDate: new Date(`${FUTURE}T00:00:00.000Z`) })
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "Absence", entityId: "a1", details: expect.objectContaining({ via: "mcp" }) }));
    expect(out.structured.done).toBe(true);
  });

  it("confirmation rejouée ou expirée : rien n'est fait", async () => {
    mcp.consumeConfirmation.mockResolvedValue(null);
    const out = await actions.confirmUnavailability({ confirmation: "kmx_tok" }, ctx);
    expect(out.text).toContain("expirée");
    expect(planning.declareAbsence).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("droits revérifiés : fiche déliée entre l'aperçu et la confirmation ⇒ refus", async () => {
    mcp.consumeConfirmation.mockResolvedValue({ memberId: "m1", startDate: FUTURE, endDate: FUTURE, reason: null });
    planning.listLinkedMemberIds.mockResolvedValue(["m2"]);
    await actions.confirmUnavailability({ confirmation: "kmx_tok" }, ctx);
    expect(planning.declareAbsence).not.toHaveBeenCalled();
  });
});

describe("répondre à une demande de disponibilité", () => {
  const month = { month: new Date("2099-03-01T00:00:00.000Z"), open: true, closesAt: null };
  const event = (over: Record<string, unknown> = {}) => ({
    id: "e1",
    title: "Culte",
    date: new Date("2099-03-14T09:00:00Z"),
    departments: [{ departmentId: "d1", name: "Son" }],
    plannedIn: [],
    ...over,
  });

  it("aperçu : événements du jour, désistement annoncé, rien d'enregistré", async () => {
    planning.listMemberAvailability.mockResolvedValue({
      months: [month],
      events: [event({ plannedIn: [{ departmentId: "d1", departmentName: "Son", withdrawable: true }] }), event({ id: "e2", date: new Date("2099-03-21T09:00:00Z") })],
    });
    const out = await actions.previewServiceAnswer({ day: FUTURE, answer: "UNAVAILABLE" }, ctx);
    expect(out.text).toContain("« Pas disponible »");
    expect(out.text).toContain("vaut désistement");
    expect(planning.saveResponses).not.toHaveBeenCalled();
    expect(mcp.createConfirmation).toHaveBeenCalledWith("g1", "answer_service", { memberId: "m1", answer: "UNAVAILABLE", eventIds: ["e1"] });
  });

  it("aperçu refusé : mois pas encore demandé ou aucun événement ce jour-là", async () => {
    planning.listMemberAvailability.mockResolvedValue({ months: [], events: [event()] });
    expect((await actions.previewServiceAnswer({ day: FUTURE, answer: "AVAILABLE" }, ctx)).text).toContain("pas encore demandées");
    planning.listMemberAvailability.mockResolvedValue({ months: [month], events: [] });
    expect((await actions.previewServiceAnswer({ day: FUTURE, answer: "AVAILABLE" }, ctx)).text).toContain("Aucun événement");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("confirmation : réponses enregistrées par le service de l'application, journalisées via mcp", async () => {
    mcp.consumeConfirmation.mockResolvedValue({ memberId: "m1", answer: "AVAILABLE", eventIds: ["e1"] });
    planning.saveResponses.mockResolvedValue({ updated: 1, alerts: 0, withdrawals: 0 });
    const out = await actions.confirmServiceAnswer({ confirmation: "kmx_tok" }, ctx);
    expect(planning.saveResponses).toHaveBeenCalledWith({ memberId: "m1", churchId: "c1", answers: [{ eventId: "e1", answer: "AVAILABLE" }], actorId: "u1" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ via: "mcp", answer: "AVAILABLE" }) }));
    expect(out.text).toContain("« Disponible » enregistrée");
  });

  it("événement passé entre-temps : message métier, rien de journalisé", async () => {
    mcp.consumeConfirmation.mockResolvedValue({ memberId: "m1", answer: "AVAILABLE", eventIds: ["e1"] });
    planning.saveResponses.mockRejectedValue(new ApiError(400, "Cet événement est déjà passé"));
    const out = await actions.confirmServiceAnswer({ confirmation: "kmx_tok" }, ctx);
    expect(out.text).toBe("Cet événement est déjà passé");
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("préparer une demande", () => {
  it("lien prérempli vers le formulaire, rien d'enregistré ni de confirmation", async () => {
    const out = await actions.draftRequest({ type: "visuel", titre: "Affiche Noël", texte: "Format A3", date: "2099-12-01" });
    expect(out.structured.link).toBe("https://koinonia.test/requests/new?type=visuel&titre=Affiche+No%C3%ABl&texte=Format+A3&date=2099-12-01");
    expect(out.text).toContain("rien n'est encore envoyé");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("proposé seulement à qui ouvre le formulaire (members:view)", () => {
    expect(actions.canDraftRequest(viewerFor("STAR"))).toBe(false);
    expect(actions.canDraftRequest(viewerFor("DEPARTMENT_HEAD"))).toBe(true);
  });
});
