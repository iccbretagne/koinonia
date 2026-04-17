/**
 * Tests — HIGH-2 : Machine d'état sur la validation photo
 *
 * - Impossible de re-valider une photo déjà APPROVED ou REJECTED
 * - PREVALIDATOR peut passer PENDING → PREVALIDATED
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockValidateMediaShareToken = vi.fn();

vi.mock("@/modules/media", () => ({
  validateMediaShareToken: (...args: unknown[]) => mockValidateMediaShareToken(...args),
  getSignedOriginalUrl: vi.fn().mockResolvedValue("https://example.com/signed-url"),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { PATCH } = await import("../route");

const makeParams = (token: string, photoId: string) =>
  Promise.resolve({ token, photoId });

const baseValidatorToken = {
  id: "tok-1",
  type: "VALIDATOR" as const,
  mediaEventId: "evt-1",
};

const basePrevalidatorToken = {
  id: "tok-2",
  type: "PREVALIDATOR" as const,
  mediaEventId: "evt-1",
};

describe("HIGH-2 : PATCH photo/[photoId] — machine d'état", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse la transition depuis APPROVED (état final)", async () => {
    mockValidateMediaShareToken.mockResolvedValue(baseValidatorToken);

    prismaMock.mediaPhoto.findUnique.mockResolvedValue({
      id: "photo-1",
      mediaEventId: "evt-1",
      status: "APPROVED",
    } as never);

    const request = new Request("http://localhost/api/media/validate/tok/photo/photo-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "REJECTED" }),
    });

    const res = await PATCH(request, { params: makeParams("tok", "photo-1") });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("APPROVED");
  });

  it("refuse la transition depuis REJECTED (état final)", async () => {
    mockValidateMediaShareToken.mockResolvedValue(baseValidatorToken);

    prismaMock.mediaPhoto.findUnique.mockResolvedValue({
      id: "photo-1",
      mediaEventId: "evt-1",
      status: "REJECTED",
    } as never);

    const request = new Request("http://localhost/api/media/validate/tok/photo/photo-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "APPROVED" }),
    });

    const res = await PATCH(request, { params: makeParams("tok", "photo-1") });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("REJECTED");
  });

  it("PREVALIDATOR peut transitionner PENDING → PREVALIDATED", async () => {
    mockValidateMediaShareToken.mockResolvedValue(basePrevalidatorToken);

    prismaMock.mediaPhoto.findUnique.mockResolvedValue({
      id: "photo-1",
      mediaEventId: "evt-1",
      status: "PENDING",
    } as never);

    prismaMock.mediaPhoto.update.mockResolvedValue({
      id: "photo-1",
      status: "PREVALIDATED",
      validatedAt: new Date(),
    } as never);

    const request = new Request("http://localhost/api/media/validate/tok/photo/photo-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "PREVALIDATED" }),
    });

    const res = await PATCH(request, { params: makeParams("tok", "photo-1") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("PREVALIDATED");
  });

  it("PREVALIDATOR ne peut pas mettre APPROVED", async () => {
    mockValidateMediaShareToken.mockResolvedValue(basePrevalidatorToken);

    prismaMock.mediaPhoto.findUnique.mockResolvedValue({
      id: "photo-1",
      mediaEventId: "evt-1",
      status: "PENDING",
    } as never);

    const request = new Request("http://localhost/api/media/validate/tok/photo/photo-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "APPROVED" }),
    });

    const res = await PATCH(request, { params: makeParams("tok", "photo-1") });
    expect(res.status).toBe(403);
  });

  it("VALIDATOR peut transitionner PREVALIDATED → APPROVED", async () => {
    mockValidateMediaShareToken.mockResolvedValue(baseValidatorToken);

    prismaMock.mediaPhoto.findUnique.mockResolvedValue({
      id: "photo-1",
      mediaEventId: "evt-1",
      status: "PREVALIDATED",
    } as never);

    prismaMock.mediaPhoto.update.mockResolvedValue({
      id: "photo-1",
      status: "APPROVED",
      validatedAt: new Date(),
    } as never);

    prismaMock.mediaPhoto.count.mockResolvedValue(0);
    prismaMock.mediaEvent.updateMany.mockResolvedValue({ count: 1 } as never);

    const request = new Request("http://localhost/api/media/validate/tok/photo/photo-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "APPROVED" }),
    });

    const res = await PATCH(request, { params: makeParams("tok", "photo-1") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("APPROVED");
  });

  it("retourne 404 si la photo est introuvable", async () => {
    mockValidateMediaShareToken.mockResolvedValue(baseValidatorToken);

    prismaMock.mediaPhoto.findUnique.mockResolvedValue(null);

    const request = new Request("http://localhost/api/media/validate/tok/photo/missing", {
      method: "PATCH",
      body: JSON.stringify({ status: "APPROVED" }),
    });

    const res = await PATCH(request, { params: makeParams("tok", "missing") });
    expect(res.status).toBe(404);
  });
});
