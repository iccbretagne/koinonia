/**
 * Tests — créneaux d'entretien par l'assistant IA (spec 082) : proposé à l'équipe Vie des STAR
 * et à l'Admin, aperçu sans écriture, confirmation par les règles de l'écran, refus.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { viewerFor } from "../../assistant/__tests__/viewers";

const mcp = { createConfirmation: vi.fn(async () => ({ token: "kmx_tok", expiresAt: new Date("2099-01-01T00:05:00Z") })), consumeConfirmation: vi.fn(), publicOrigin: () => "https://koinonia.test" };
vi.mock("@/modules/mcp", () => mcp);
let canManage = true;
vi.mock("@/modules/serving/auth", () => ({ servingActorFromSession: vi.fn(async () => ({ canManage })) }));
const planSlots = vi.fn();
const createSlots = vi.fn();
vi.mock("@/modules/serving", () => ({
  listInterviewers: vi.fn(async () => [
    { id: "user-1", name: "Awa Traoré" },
    { id: "u2", name: "Paul Nguessan" },
  ]),
  planSlots: (...a: unknown[]) => planSlots(...a),
  createSlots: (...a: unknown[]) => createSlots(...a),
}));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const s = await import("../_actions/serving");
const { ApiError } = await import("@/lib/api-utils");

const ctx = { session: { user: { id: "user-1" } } as never, churchId: "c1", viewer: viewerFor("STAR", { predicates: ["pvsTeam"] }), grantId: "g1" };
const row = (iso: string) => ({ start: new Date(iso), durationMinutes: 30, location: "Salle 2", visioUrl: null });

beforeEach(() => {
  vi.clearAllMocks();
  canManage = true;
  planSlots.mockResolvedValue([row("2099-12-05T09:00:00Z"), row("2099-12-05T09:30:00Z")]);
  createSlots.mockResolvedValue(2);
});

describe("create_interview_slots", () => {
  it("proposé à l'équipe PVS (même STAR) et à l'Admin ; jamais à un STAR hors PVS ni module coupé", () => {
    const has = (v: ReturnType<typeof viewerFor>) => s.SERVING_ACTIONS.every((a) => a.available(v));
    expect(has(viewerFor("STAR", { predicates: ["pvsTeam"] }))).toBe(true);
    expect(has(viewerFor("ADMIN"))).toBe(true);
    expect(has(viewerFor("STAR"))).toBe(false);
    expect(has(viewerFor("SECRETARY"))).toBe(false);
    expect(has(viewerFor("ADMIN", { modules: ["core"] }))).toBe(false);
  });

  it("aperçu : série pour la personne connectée par défaut, rien d'écrit", async () => {
    const out = await s.previewCreateInterviewSlots({ series: { days: ["2099-12-05"], from: "10:00", to: "11:00" }, location: "Salle 2" }, ctx);
    expect(out.text).toContain("2 créneau(x) d'entretien de 30 min, Salle 2");
    expect(planSlots).toHaveBeenCalledWith("c1", { series: expect.objectContaining({ interviewerId: "user-1", durationMinutes: 30 }) });
    expect(createSlots).not.toHaveBeenCalled();
  });

  it("refus : hors équipe, ni slots ni series, personne inconnue, règle de l'écran", async () => {
    canManage = false;
    expect((await s.previewCreateInterviewSlots({ slots: [{ day: "2099-12-05", time: "10:00" }] }, ctx)).text).toContain("réservés à l'équipe");
    canManage = true;
    expect((await s.previewCreateInterviewSlots({}, ctx)).text).toContain("soit `slots`");
    expect((await s.previewCreateInterviewSlots({ slots: [{ day: "2099-12-05", time: "10:00" }], interviewer: "Zoé" }, ctx)).text).toContain("Personne de l'équipe");
    planSlots.mockRejectedValueOnce(new ApiError(409, "Cette personne a déjà un créneau à ce moment-là"));
    expect((await s.previewCreateInterviewSlots({ slots: [{ day: "2099-12-05", time: "10:00" }], interviewer: "paul" }, ctx)).text).toContain("déjà un créneau");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("confirmation : jeton consommé, droit revérifié, créé et journalisé via mcp", async () => {
    mcp.consumeConfirmation.mockResolvedValueOnce({ input: { slots: [{ day: "2099-12-05", time: "10:00", interviewerId: "u2" }] }, count: 1 });
    const out = await s.confirmCreateInterviewSlots({ confirmation: "kmx_tok_123" }, ctx);
    expect(out.structured).toMatchObject({ done: true, created: 2 });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "ServingInterviewSlot", details: expect.objectContaining({ via: "mcp" }) }));

    mcp.consumeConfirmation.mockResolvedValueOnce(null);
    expect((await s.confirmCreateInterviewSlots({ confirmation: "kmx_tok_123" }, ctx)).text).toContain("expirée");
    mcp.consumeConfirmation.mockResolvedValueOnce({ input: { slots: [] }, count: 1 });
    createSlots.mockRejectedValueOnce(new ApiError(400, "Le créneau du 2099-12-05 à 10:00 est passé"));
    expect((await s.confirmCreateInterviewSlots({ confirmation: "kmx_tok_123" }, ctx)).text).toContain("Aucun créneau n'est créé");
  });
});
