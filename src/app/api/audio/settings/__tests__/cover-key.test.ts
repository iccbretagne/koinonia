import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

/** La couverture par défaut est signée pour tout auditeur : elle ne vient que de l'église. */

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({
  requireCurrentChurchPermission: vi.fn(async () => ({ churchId: "church-1", user: { id: "user-1" } })),
}));

const { PUT } = await import("../route");

const put = (body: unknown) =>
  PUT(new Request("http://k.test/api/audio/settings", { method: "PUT", body: JSON.stringify(body) }));

describe("PUT /api/audio/settings — couverture par défaut", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuse une clé de stockage hors de l'église", async () => {
    const res = await put({ defaultCoverKey: "accounting/church-2/facture.pdf" });

    expect(res.status).toBe(400);
    expect(prismaMock.audioSettings.upsert).not.toHaveBeenCalled();
  });

  it("accepte une couverture de l'église", async () => {
    prismaMock.audioSettings.upsert.mockResolvedValue({} as never);

    const res = await put({ defaultCoverKey: "audio-settings/church-1/cover-abc.jpg" });

    expect(res.status).toBe(200);
  });
});
