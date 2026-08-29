// Spec 031 (constat 2) — la page /admin/access chargeait tous les utilisateurs de la
// plateforme (`where: {}`), fuite inter-églises corrigée par un filtre d'appartenance.
// Ce test vérifie la forme de la requête Prisma envoyée, seule façon de garantir la
// non-régression sans base réelle (convention déjà suivie par dept-scope.test.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminSession, createMinisterSession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";
import { fakeGetUserMinistryScope } from "@/lib/__tests__/support/ministry-scope-mock";

const mockRequireAuth = vi.fn();
const mockGetCurrentChurchId = vi.fn();
const mockRequireChurchPermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: () => mockRequireAuth(),
  getCurrentChurchId: (...args: unknown[]) => mockGetCurrentChurchId(...args),
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  getUserMinistryScope: (...args: Parameters<typeof fakeGetUserMinistryScope>) =>
    fakeGetUserMinistryScope(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const AccessPage = (await import("../page")).default;

describe("AccessPage — étanchéité inter-églises (spec 031, T26)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentChurchId.mockResolvedValue("church-1");
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.memberLinkRequest.findMany.mockResolvedValue([]);
    prismaMock.ministry.findMany.mockResolvedValue([]);
  });

  it("Admin (non scoped) : la requête utilisateurs ne renvoie plus `where: {}`, mais un filtre d'appartenance à l'église courante", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession("church-1"));
    mockRequireChurchPermission.mockResolvedValue(undefined);

    await AccessPage();

    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where).not.toEqual({});
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { churchRoles: { some: { churchId: "church-1" } } },
        { memberLinks: { some: { churchId: "church-1" } } },
        { memberLinkRequests: { some: { churchId: "church-1" } } },
      ])
    );
  });

  it("Admin (non scoped) : les demandes en attente et refusées sont filtrées sur l'église courante", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession("church-1"));
    mockRequireChurchPermission.mockResolvedValue(undefined);

    await AccessPage();

    for (const call of prismaMock.memberLinkRequest.findMany.mock.calls) {
      expect(call[0].where.churchId).toBe("church-1");
    }
  });

  it("Ministre (périmètre restreint) : la requête utilisateurs est en plus bornée à ses ministères", async () => {
    mockRequireAuth.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    mockRequireChurchPermission.mockResolvedValue(undefined);

    await AccessPage();

    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeDefined();
    const scopeClause = JSON.stringify(where.AND[1]);
    expect(scopeClause).toContain("min-A");
  });

  it("Ministre (périmètre restreint) : la liste des ministères est bornée à SES ministères", async () => {
    mockRequireAuth.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    mockRequireChurchPermission.mockResolvedValue(undefined);

    await AccessPage();

    const where = prismaMock.ministry.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ in: ["min-A"] });
  });

  it("Admin (non scoped) : la liste des ministères n'est pas bornée par ministryId", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession("church-1"));
    mockRequireChurchPermission.mockResolvedValue(undefined);

    await AccessPage();

    const where = prismaMock.ministry.findMany.mock.calls[0][0].where;
    expect(where.id).toBeUndefined();
    expect(where.churchId).toBe("church-1");
  });
});
