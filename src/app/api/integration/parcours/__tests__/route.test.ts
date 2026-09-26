/**
 * Tests — GET/POST /api/integration/parcours (spec 054/#583, défaut A2 de audit-rbac.md).
 *
 * La garde `requireIntegrationFullAccess` était copiée à la main dans ce fichier (3 fois) avec
 * un raccourci `members:manage || events:manage` : tout Ministre/Resp. département y accédait
 * quel que soit son département. Ces tests vérifient que la garde partagée est bien appelée et
 * que son refus se traduit par un 403, sans avoir à retester sa logique interne (couverte par
 * `src/modules/integration/__tests__/auth.test.ts`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireIntegrationFullAccess = vi.fn();

vi.mock("@/modules/integration", () => ({
  requireIntegrationFullAccess: (...args: unknown[]) => mockRequireIntegrationFullAccess(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { GET, POST } = await import("../route");

describe("GET /api/integration/parcours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse (403) quand la garde d'accès complet rejette l'appelant (Ministre/Resp. département hors équipe)", async () => {
    mockRequireIntegrationFullAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const request = new Request("http://localhost/api/integration/parcours?churchId=church-1");
    const res = await GET(request);

    expect(res.status).toBe(403);
    expect(prismaMock.personJourney.findMany).not.toHaveBeenCalled();
  });

  it("liste les dossiers quand la garde accepte", async () => {
    mockRequireIntegrationFullAccess.mockResolvedValue({ session: createAdminSession("church-1") });
    prismaMock.personJourney.findMany.mockResolvedValue([]);

    const request = new Request("http://localhost/api/integration/parcours?churchId=church-1");
    const res = await GET(request);

    expect(res.status).toBe(200);
    expect(mockRequireIntegrationFullAccess).toHaveBeenCalledWith("church-1");
  });
});

describe("POST /api/integration/parcours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse (403) quand la garde d'accès complet rejette l'appelant", async () => {
    mockRequireIntegrationFullAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const request = new Request("http://localhost/api/integration/parcours", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", firstName: "Jean", lastName: "Dupont" }),
    });
    const res = await POST(request);

    expect(res.status).toBe(403);
    expect(prismaMock.personJourney.create).not.toHaveBeenCalled();
  });

  it("crée le dossier quand la garde accepte", async () => {
    mockRequireIntegrationFullAccess.mockResolvedValue({ session: createAdminSession("church-1") });
    prismaMock.personJourney.findFirst.mockResolvedValue(null);
    prismaMock.personJourney.create.mockResolvedValue({ id: "pj-1" } as never);

    const request = new Request("http://localhost/api/integration/parcours", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", firstName: "Jean", lastName: "Dupont" }),
    });
    const res = await POST(request);

    expect(res.status).toBe(201);
  });
});
