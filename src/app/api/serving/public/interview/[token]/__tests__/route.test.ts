import { beforeEach, describe, expect, it, vi } from "vitest";

const findApplicationIdByToken = vi.fn();
const publicInterviewView = vi.fn();
const bookSlot = vi.fn();
const cancelInterview = vi.fn();
vi.mock("@/modules/serving", () => ({
  findApplicationIdByToken: (...a: unknown[]) => findApplicationIdByToken(...a),
  publicInterviewView: (...a: unknown[]) => publicInterviewView(...a),
  bookSlot: (...a: unknown[]) => bookSlot(...a),
  cancelInterview: (...a: unknown[]) => cancelInterview(...a),
  declineSlots: vi.fn(),
}));
const requireRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: (...a: unknown[]) => requireRateLimit(...a), getClientIp: () => "203.0.113.1" }));

const { GET, POST } = await import("../route");
const params = (token: string) => ({ params: Promise.resolve({ token }) });
const req = (body?: unknown) => new Request("http://localhost/api/serving/public/interview/x", body ? { method: "POST", body: JSON.stringify(body) } : undefined);

beforeEach(() => {
  vi.clearAllMocks();
  publicInterviewView.mockResolvedValue({ open: true, interview: null, freeSlots: [] });
});

describe("/api/serving/public/interview/[token]", () => {
  it("lien inconnu ou mal formé : même 404, rien n'est lu ni modifié", async () => {
    findApplicationIdByToken.mockResolvedValue(null);
    const a = await GET(req(), params("pas-un-jeton"));
    const b = await POST(req({ action: "book", slotId: "s1" }), params("a".repeat(64)));
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(await a.json()).toEqual(await b.json());
    expect(bookSlot).not.toHaveBeenCalled();
  });

  it("débit limité par adresse IP", async () => {
    findApplicationIdByToken.mockResolvedValue({ id: "app-1", churchId: "c" });
    await GET(req(), params("a".repeat(64)));
    expect(requireRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ prefix: "serving-interview:203.0.113.1", max: 30 }));
  });

  it("réserve au nom du candidat du lien, jamais d'une autre candidature", async () => {
    findApplicationIdByToken.mockResolvedValue({ id: "app-1", churchId: "c" });
    const res = await POST(req({ action: "book", slotId: "s1" }), params("a".repeat(64)));
    expect(res.status).toBe(200);
    expect(bookSlot).toHaveBeenCalledWith("app-1", "s1", { byCandidate: true });
  });

  it("annulation par le candidat : motif CANDIDATE, rendez-vous exigé", async () => {
    findApplicationIdByToken.mockResolvedValue({ id: "app-1", churchId: "c" });
    await POST(req({ action: "cancel" }), params("a".repeat(64)));
    expect(cancelInterview).toHaveBeenCalledWith("app-1", "CANDIDATE", { required: true });
  });
});
