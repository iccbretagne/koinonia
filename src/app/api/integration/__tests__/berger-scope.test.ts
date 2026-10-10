import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

/**
 * Périmètre restreint d'un berger / co-berger (ses familles) sur les routes d'intégration :
 * - une demande encore sans famille n'est pas dans son périmètre (comme dans la liste) ;
 * - la gestion des bergers (affecter, retirer, lister) est réservée à l'accès complet : sinon,
 *   un berger pourrait s'affecter lui-même à d'autres familles et élargir son propre périmètre.
 */

const mockRequireAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, requireAuth: () => mockRequireAuth() };
});
vi.mock("@/lib/registry", () => ({ rolePermissions: { STAR: [] } }));

const requestRoute = await import("../requests/[id]/route");
const historyRoute = await import("../requests/[id]/history/route");
const leadersRoute = await import("../leaders/route");
const leaderRoute = await import("../leaders/[id]/route");

const churchId = "c1";
const berger = {
  user: {
    id: "berger-1",
    isSuperAdmin: false,
    churchRoles: [{ churchId, role: "STAR", departments: [] }],
  },
};
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

function bergerOfFamily(familyId: number) {
  mockRequireAuth.mockResolvedValue(berger);
  prismaMock.department.count.mockResolvedValue(0 as never);
  prismaMock.familyLeaderAssignment.findMany.mockResolvedValue([{ familyId }] as never);
}

describe("demandes d'intégration : périmètre du berger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bergerOfFamily(1);
  });

  it.each([
    ["sans famille", null],
    ["d'une autre famille", 2],
  ])("GET d'une demande %s : 403", async (_label, assignedFamilyId) => {
    prismaMock.familyIntegrationRequest.findUnique.mockResolvedValue({ id: "r1", churchId, assignedFamilyId } as never);

    const res = await requestRoute.GET(new Request("https://k.test/api/integration/requests/r1"), idParams("r1"));

    expect(res.status).toBe(403);
  });

  it("PATCH d'une demande sans famille : 403 sans écriture", async () => {
    prismaMock.familyIntegrationRequest.findUnique.mockResolvedValue({ id: "r1", churchId, assignedFamilyId: null, status: "SUBMITTED" } as never);

    const res = await requestRoute.PATCH(
      new Request("https://k.test/api/integration/requests/r1", { method: "PATCH", body: JSON.stringify({ action: "note", notes: "x" }) }),
      idParams("r1")
    );

    expect(res.status).toBe(403);
    expect(prismaMock.familyIntegrationRequest.update).not.toHaveBeenCalled();
  });

  it("historique d'une demande sans famille : 403", async () => {
    prismaMock.familyIntegrationRequest.findUnique.mockResolvedValue({ churchId, assignedFamilyId: null } as never);

    const res = await historyRoute.GET(new Request("https://k.test/api/integration/requests/r1/history"), idParams("r1"));

    expect(res.status).toBe(403);
  });

  it("GET d'une demande de sa famille : 200", async () => {
    prismaMock.familyIntegrationRequest.findUnique.mockResolvedValue({ id: "r1", churchId, assignedFamilyId: 1 } as never);

    const res = await requestRoute.GET(new Request("https://k.test/api/integration/requests/r1"), idParams("r1"));

    expect(res.status).toBe(200);
  });
});

describe("gestion des bergers : accès complet requis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bergerOfFamily(1);
  });

  it("un berger ne s'affecte pas à une autre famille (403, rien créé)", async () => {
    const res = await leadersRoute.POST(
      new Request("https://k.test/api/integration/leaders", {
        method: "POST",
        body: JSON.stringify({ churchId, userId: "berger-1", familyId: 2, familyName: "Famille B", role: "BERGER" }),
      })
    );

    expect(res.status).toBe(403);
    expect(prismaMock.familyLeaderAssignment.create).not.toHaveBeenCalled();
  });

  it("un berger ne retire pas une affectation (403, rien supprimé)", async () => {
    prismaMock.familyLeaderAssignment.findUnique.mockResolvedValue({ id: "a1", churchId, familyId: 1, familyName: "Famille A", role: "BERGER", userId: "autre" } as never);

    const res = await leaderRoute.DELETE(new Request("https://k.test/api/integration/leaders/a1", { method: "DELETE" }), idParams("a1"));

    expect(res.status).toBe(403);
    expect(prismaMock.familyLeaderAssignment.delete).not.toHaveBeenCalled();
  });

  it("un berger ne liste pas les bergers de l'église (403)", async () => {
    const res = await leadersRoute.GET(new Request(`https://k.test/api/integration/leaders?churchId=${churchId}`));

    expect(res.status).toBe(403);
  });
});
