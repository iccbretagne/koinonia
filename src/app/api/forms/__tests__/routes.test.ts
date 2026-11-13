/**
 * Tests — routes des formulaires (spec 079, lot 1) : `forms:manage` dans l'église du formulaire,
 * public avec anti-robots, réservé aux comptes de l'église, doublon renvoyé par email, export
 * journalisé.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSecretarySession, createStarSession } from "@/__mocks__/auth";
import { ApiError } from "@/lib/api-utils";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const session = { current: null as unknown };
const requireChurchPermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => session.current),
  requireAuth: vi.fn(async () => session.current),
  requireChurchPermission: (...a: unknown[]) => requireChurchPermission(...a),
  requireCurrentChurchPermission: vi.fn(async () => ({ session: session.current, churchId: "church-1" })),
}));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
const verifyTurnstile = vi.fn(async (..._a: unknown[]) => true);
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: (...a: unknown[]) => verifyTurnstile(...a) }));
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: vi.fn(), getClientIp: () => "1.2.3.4" }));
const forms = {
  UNAVAILABLE: "Ce formulaire n'est pas disponible.",
  loadAnswerableForm: vi.fn(),
  submitResponse: vi.fn(),
  sendReceipt: vi.fn(),
  resendManageLink: vi.fn(),
  needsContact: (f: { access: string; anonymous: boolean }) => f.access === "PUBLIC" && !f.anonymous,
  recoverResponseLink: vi.fn(async (..._a: unknown[]) => null as null | { contactEmail: string; manageToken: string }),
  exportResponses: vi.fn(async () => ({ buffer: Buffer.from("x"), fileName: "pcnc-reponses.xlsx", count: 3 })),
  changeStatus: vi.fn(async () => ({ id: "f1" })),
  publicView: vi.fn(async () => ({ id: "f1" })),
  findMemberResponse: vi.fn(async () => null),
  hasAnonymousReceipt: vi.fn(async () => false),
  answersRecord: vi.fn(),
};
vi.mock("@/modules/forms", () => forms);

const status = await import("../[id]/status/route");
const exportRoute = await import("../[id]/export/route");
const publicGet = await import("../public/[churchSlug]/[formSlug]/route");
const publicPost = await import("../public/[churchSlug]/[formSlug]/responses/route");
const recover = await import("../public/[churchSlug]/[formSlug]/recover/route");

const idParams = { params: Promise.resolve({ id: "f1" }) };
const slugParams = { params: Promise.resolve({ churchSlug: "rennes", formSlug: "pcnc" }) };
const post = (body: unknown) => new Request("http://test", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const FORM = { id: "f1", churchId: "church-1", access: "PUBLIC", anonymous: false, title: "PCNC", church: { name: "ICC", slug: "rennes" } };

beforeEach(() => {
  vi.clearAllMocks();
  session.current = createSecretarySession();
  requireChurchPermission.mockImplementation(async () => session.current);
  prismaMock.form.findFirst.mockResolvedValue({ churchId: "church-1" });
  forms.loadAnswerableForm.mockResolvedValue(FORM);
});

describe("gestion : église du formulaire", () => {
  it("vérifie forms:manage dans l'église du formulaire, journalise", async () => {
    const res = await status.POST(post({ action: "publish" }), idParams);
    expect(res.status).toBe(200);
    expect(requireChurchPermission).toHaveBeenCalledWith("forms:manage", "church-1");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "Form", entityId: "f1", details: { status: "publish" } }));
  });

  it("formulaire supprimé, inexistant : 404 avant tout droit ; sans droit : refus", async () => {
    prismaMock.form.findFirst.mockResolvedValueOnce(null);
    expect((await status.POST(post({ action: "close" }), idParams)).status).toBe(404);
    expect(requireChurchPermission).not.toHaveBeenCalled();
    requireChurchPermission.mockRejectedValueOnce(new ApiError(403, "Forbidden"));
    expect((await status.POST(post({ action: "close" }), idParams)).status).toBe(403);
    expect(forms.changeStatus).not.toHaveBeenCalled();
  });

  it("export : classeur et journal EXPORT", async () => {
    const res = await exportRoute.GET(new Request("http://test"), idParams);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "EXPORT", details: { responses: 3 } }));
  });
});

describe("réponse publique", () => {
  it("formulaire indisponible : même 404", async () => {
    forms.loadAnswerableForm.mockResolvedValue(null);
    const res = await publicGet.GET(new Request("http://test"), slugParams);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe(forms.UNAVAILABLE);
  });

  it("public : anti-robots exigé", async () => {
    session.current = null;
    verifyTurnstile.mockResolvedValueOnce(false);
    expect((await publicPost.POST(post({ answers: {} }), slugParams)).status).toBe(400);
    expect(forms.submitResponse).not.toHaveBeenCalled();
  });

  it("réservé : 401 sans compte, 404 pour un compte d'une autre église", async () => {
    forms.loadAnswerableForm.mockResolvedValue({ ...FORM, access: "MEMBERS" });
    session.current = null;
    expect((await publicGet.GET(new Request("http://test"), slugParams)).status).toBe(401);
    session.current = createStarSession("church-2");
    expect((await publicGet.GET(new Request("http://test"), slugParams)).status).toBe(404);
    expect((await publicPost.POST(post({ answers: {} }), slugParams)).status).toBe(404);
    session.current = createStarSession("church-1");
    expect((await publicGet.GET(new Request("http://test"), slugParams)).status).toBe(200);
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("doublon public : lien renvoyé à l'adresse, jamais dans la réponse", async () => {
    session.current = null;
    forms.submitResponse.mockResolvedValue({ kind: "duplicate", responseId: "r0", contactEmail: "marie@exemple.fr", manageToken: "a".repeat(64) });
    const res = await publicPost.POST(post({ answers: {}, turnstileToken: "t" }), slugParams);
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain("a".repeat(64));
    expect(forms.resendManageLink).toHaveBeenCalledWith(FORM, "marie@exemple.fr", "a".repeat(64));
  });

  it("envoi : accusé de réception, jeton rendu à l'auteur seulement", async () => {
    session.current = null;
    forms.submitResponse.mockResolvedValue({ kind: "created", responseId: "r1", status: "CONFIRMED", manageToken: "b".repeat(64), contactEmail: "x@y.fr", userId: null, values: new Map() });
    const res = await publicPost.POST(post({ answers: { q1: "a" }, turnstileToken: "t" }), slugParams);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ status: "CONFIRMED", manageToken: "b".repeat(64) });
    expect(forms.sendReceipt).toHaveBeenCalledWith(expect.objectContaining({ responseId: "r1", contactEmail: "x@y.fr" }));
  });

  it("retrouver ma réponse : lien renvoyé à l'adresse, même réponse que l'adresse soit connue ou non", async () => {
    const ask = async () => {
      const res = await recover.POST(post({ email: "Marie@Exemple.fr", turnstileToken: "t" }), slugParams);
      return { status: res.status, body: await res.json() };
    };
    const unknown = await ask();
    expect(forms.recoverResponseLink).toHaveBeenCalledWith("f1", "marie@exemple.fr");
    expect(forms.resendManageLink).not.toHaveBeenCalled();
    forms.recoverResponseLink.mockResolvedValueOnce({ contactEmail: "marie@exemple.fr", manageToken: "c".repeat(64) });
    const known = await ask();
    expect(forms.resendManageLink).toHaveBeenCalledWith(FORM, "marie@exemple.fr", "c".repeat(64));
    expect(known).toEqual(unknown);
    expect(JSON.stringify(known)).not.toContain("c".repeat(64));
    forms.loadAnswerableForm.mockResolvedValue(null);
    expect(await ask()).toEqual(unknown);
    verifyTurnstile.mockResolvedValueOnce(false);
    expect((await recover.POST(post({ email: "x@y.fr" }), slugParams)).status).toBe(400);
  });
});
