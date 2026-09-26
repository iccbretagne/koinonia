/**
 * Tests — GET/PATCH/DELETE /api/integration/parcours/[id] (spec 054/#583, défaut A2).
 * Même principe que `../__tests__/route.test.ts` : on vérifie l'appel et le refus de la garde
 * partagée, pas sa logique interne.
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

const { GET, PATCH, DELETE } = await import("../route");
const makeParams = (id: string) => Promise.resolve({ id });

const journey = { id: "pj-1", churchId: "church-1" };

describe("GET/PATCH/DELETE /api/integration/parcours/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.personJourney.findUnique.mockResolvedValue(journey as never);
  });

  it("GET refuse (403) quand la garde d'accès complet rejette l'appelant", async () => {
    mockRequireIntegrationFullAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await GET(new Request("http://localhost"), { params: makeParams("pj-1") });

    expect(res.status).toBe(403);
  });

  it("PATCH refuse (403) quand la garde d'accès complet rejette l'appelant, sans écrire", async () => {
    mockRequireIntegrationFullAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ notes: "x" }),
    });
    const res = await PATCH(request, { params: makeParams("pj-1") });

    expect(res.status).toBe(403);
    expect(prismaMock.personJourney.update).not.toHaveBeenCalled();
  });

  it("DELETE refuse (403) quand la garde d'accès complet rejette l'appelant, sans supprimer", async () => {
    mockRequireIntegrationFullAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await DELETE(new Request("http://localhost"), { params: makeParams("pj-1") });

    expect(res.status).toBe(403);
    expect(prismaMock.personJourney.delete).not.toHaveBeenCalled();
  });

  it("PATCH réussit quand la garde accepte", async () => {
    mockRequireIntegrationFullAccess.mockResolvedValue({ session: createAdminSession("church-1") });
    prismaMock.personJourney.update.mockResolvedValue({ ...journey, notes: "x" } as never);

    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ notes: "x" }),
    });
    const res = await PATCH(request, { params: makeParams("pj-1") });

    expect(res.status).toBe(200);
    expect(mockRequireIntegrationFullAccess).toHaveBeenCalledWith("church-1");
  });
});
