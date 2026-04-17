/**
 * Tests — P0-6 : MediaSettings multi-tenant
 *
 * - Deux églises distinctes ont des settings indépendants
 * - GET retourne les settings de l'église demandée (pas ceux d'une autre église)
 * - PUT met à jour uniquement les settings de l'église concernée
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

const { GET, PUT } = await import("../route");

const makeSettings = (churchId: string, retentionDays = 30) => ({
  id: `settings-${churchId}`,
  churchId,
  logoKey: null,
  faviconKey: null,
  logoFilename: null,
  faviconFilename: null,
  retentionDays,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("GET /api/media/settings — P0-6 multi-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
  });

  it("retourne les settings de l'église demandée (church-A)", async () => {
    prismaMock.mediaSettings.upsert.mockResolvedValue(
      makeSettings("church-A", 60) as never
    );

    const res = await GET(
      new Request("http://localhost/api/media/settings?churchId=church-A")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.churchId).toBe("church-A");
    expect(body.retentionDays).toBe(60);

    expect(prismaMock.mediaSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { churchId: "church-A" },
      })
    );
  });

  it("retourne les settings de l'église church-B indépendamment de church-A", async () => {
    prismaMock.mediaSettings.upsert.mockResolvedValue(
      makeSettings("church-B", 90) as never
    );

    const res = await GET(
      new Request("http://localhost/api/media/settings?churchId=church-B")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.churchId).toBe("church-B");
    expect(body.retentionDays).toBe(90);

    // Vérifie que l'upsert cible bien church-B et non church-A
    expect(prismaMock.mediaSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { churchId: "church-B" },
        create: expect.objectContaining({ churchId: "church-B" }),
      })
    );
  });

  it("retourne 400 si churchId manquant", async () => {
    const res = await GET(new Request("http://localhost/api/media/settings"));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/media/settings — P0-6 multi-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
  });

  it("met à jour uniquement les settings de l'église church-A", async () => {
    prismaMock.mediaSettings.upsert.mockResolvedValue(
      makeSettings("church-A", 45) as never
    );

    const res = await PUT(
      new Request("http://localhost/api/media/settings?churchId=church-A", {
        method: "PUT",
        body: JSON.stringify({ retentionDays: 45 }),
      })
    );

    expect(res.status).toBe(200);
    expect(prismaMock.mediaSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { churchId: "church-A" },
        update: expect.objectContaining({ retentionDays: 45 }),
        create: expect.objectContaining({ churchId: "church-A", retentionDays: 45 }),
      })
    );
  });
});
