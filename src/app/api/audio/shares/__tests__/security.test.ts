/**
 * Sécurité des routes d'administration du partage de bibliothèque audio (spec 036) :
 * `audio:manage` exigé, rate-limit actif sur le POST, révocation bornée à l'église propriétaire,
 * traçabilité (logAudit) sur ouverture et révocation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { ApiError } from "@/lib/errors";

const mockRequireCurrentChurchPermission = vi.fn();
const mockRequireRateLimit = vi.fn();
const mockLogAudit = vi.fn();
const mockGrantLibraryShare = vi.fn();
const mockRevokeLibraryShare = vi.fn();
const mockListOutgoingShares = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireCurrentChurchPermission: (...args: unknown[]) => mockRequireCurrentChurchPermission(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => mockLogAudit(...args) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: (...args: unknown[]) => mockRequireRateLimit(...args),
  RATE_LIMIT_SENSITIVE: { windowMs: 60_000, max: 10 },
}));
vi.mock("@/modules/audio", () => ({
  listOutgoingShares: (...args: unknown[]) => mockListOutgoingShares(...args),
  grantLibraryShare: (...args: unknown[]) => mockGrantLibraryShare(...args),
  revokeLibraryShare: (...args: unknown[]) => mockRevokeLibraryShare(...args),
}));

const { GET, POST } = await import("../route");
const { DELETE } = await import("../[id]/route");

const churchId = "church-1";
const session = { user: { id: "user-1" } };

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCurrentChurchPermission.mockResolvedValue({ session, churchId });
  mockRequireRateLimit.mockReset();
});

describe("GET /api/audio/shares", () => {
  it("exige audio:manage dans l'église courante", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ slug: "eglise-1" } as never);
    mockListOutgoingShares.mockResolvedValue([]);

    await GET();

    expect(mockRequireCurrentChurchPermission).toHaveBeenCalledWith("audio:manage");
  });

  it("403 quand la permission manque", async () => {
    mockRequireCurrentChurchPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await GET();

    expect(res.status).toBe(403);
  });
});

describe("POST /api/audio/shares", () => {
  it("exige audio:manage avant tout", async () => {
    mockRequireCurrentChurchPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ slug: "eglise-b", confirm: false }) })
    );

    expect(res.status).toBe(403);
    expect(mockGrantLibraryShare).not.toHaveBeenCalled();
  });

  it("applique le rate-limit sensible sur les deux temps du POST", async () => {
    mockGrantLibraryShare.mockResolvedValue({ churchId: "church-b", churchName: "Église B" });

    await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ slug: "eglise-b", confirm: false }) }));

    expect(mockRequireRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prefix: `audio-shares:${session.user.id}`, max: 10 })
    );
  });

  it("429 quand le rate-limit est dépassé", async () => {
    mockRequireRateLimit.mockImplementation(() => {
      throw new ApiError(429, "Trop de requêtes. Réessayez plus tard.");
    });

    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ slug: "eglise-b", confirm: false }) })
    );

    expect(res.status).toBe(429);
  });

  it("confirm: false résout sans écrire d'audit", async () => {
    mockGrantLibraryShare.mockResolvedValue({ churchId: "church-b", churchName: "Église B" });

    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ slug: "eglise-b", confirm: false }) })
    );
    const body = await res.json();

    expect(body).toEqual({ churchName: "Église B" });
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("confirm: true crée et journalise l'ouverture", async () => {
    const createdAt = new Date("2026-09-02");
    mockGrantLibraryShare.mockResolvedValue({
      churchId: "church-b",
      churchName: "Église B",
      shareId: "share-1",
      createdAt,
    });

    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ slug: "eglise-b", confirm: true }) })
    );

    expect(res.status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: session.user.id,
        churchId,
        action: "CREATE",
        entityType: "AudioLibraryShare",
        entityId: "share-1",
        details: { guestChurchId: "church-b", guestChurchName: "Église B" },
      })
    );
  });

  it("propage un slug inconnu en 404", async () => {
    mockGrantLibraryShare.mockRejectedValue(new ApiError(404, "Identifiant inconnu"));

    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ slug: "inconnu", confirm: true }) })
    );

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/audio/shares/[id]", () => {
  it("exige audio:manage dans l'église courante", async () => {
    mockRequireCurrentChurchPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), idParams("share-1"));

    expect(res.status).toBe(403);
    expect(mockRevokeLibraryShare).not.toHaveBeenCalled();
  });

  it("révocation impossible sur un partage d'une autre église — propagée en 404", async () => {
    mockRevokeLibraryShare.mockRejectedValue(new ApiError(404, "Partage introuvable"));

    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), idParams("share-of-another-church"));

    expect(res.status).toBe(404);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("journalise la révocation", async () => {
    mockRevokeLibraryShare.mockResolvedValue(undefined);

    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), idParams("share-1"));

    expect(res.status).toBe(200);
    expect(mockRevokeLibraryShare).toHaveBeenCalledWith(churchId, "share-1");
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: session.user.id,
        churchId,
        action: "DELETE",
        entityType: "AudioLibraryShare",
        entityId: "share-1",
      })
    );
  });
});
