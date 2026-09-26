// Spec 054 (Lot 1, T54) — les pages dédiées /admin/access/users/[userId] et
// /admin/access/roles/[role] doivent 404 (jamais 403) quand la cible échappe au périmètre
// de l'appelant : un Ministre restreint ne doit pas pouvoir distinguer « personne/rôle
// inexistant » de « hors de mon périmètre » (voir commentaires des deux page.tsx).
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

const mockGetAccessPerson = vi.fn();
const mockLoadAccessPeople = vi.fn();
const mockListInheritedAccess = vi.fn();
vi.mock("@/lib/access-overview", () => ({
  getAccessPerson: (...args: unknown[]) => mockGetAccessPerson(...args),
  loadAccessPeople: (...args: unknown[]) => mockLoadAccessPeople(...args),
  listInheritedAccess: (...args: unknown[]) => mockListInheritedAccess(...args),
}));

const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));

const PersonAccessPage = (await import("../users/[userId]/page")).default;
const RoleHoldersPage = (await import("../roles/[role]/page")).default;

describe("/admin/access/users/[userId] — 404 hors périmètre (spec 054, T54)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockGetCurrentChurchId.mockResolvedValue("church-1");
    mockRequireChurchPermission.mockResolvedValue(undefined);
    mockListInheritedAccess.mockResolvedValue(new Map());
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    prismaMock.ministry.findMany.mockResolvedValue([]);
  });

  it("404 quand getAccessPerson ne renvoie personne (hors périmètre ou inexistant)", async () => {
    mockRequireAuth.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    mockGetAccessPerson.mockResolvedValue(null);

    await expect(
      PersonAccessPage({ params: Promise.resolve({ userId: "user-outside" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("pas de 404 pour un Admin quand getAccessPerson renvoie la personne", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession("church-1"));
    mockGetAccessPerson.mockResolvedValue({
      id: "user-1",
      name: "Jean Dupont",
      displayName: null,
      email: "jean@example.com",
      image: null,
    });

    await expect(
      PersonAccessPage({ params: Promise.resolve({ userId: "user-1" }) })
    ).resolves.toBeDefined();
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});

describe("/admin/access/roles/[role] — 404 hors périmètre (spec 054, T54)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockGetCurrentChurchId.mockResolvedValue("church-1");
    mockRequireChurchPermission.mockResolvedValue(undefined);
    mockLoadAccessPeople.mockResolvedValue([]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    prismaMock.ministry.findMany.mockResolvedValue([]);
  });

  it("404 pour un paramètre de rôle inconnu", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession("church-1"));

    await expect(
      RoleHoldersPage({ params: Promise.resolve({ role: "NOT_A_ROLE" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404 pour un Ministre restreint sur un rôle transverse (SECRETARY)", async () => {
    mockRequireAuth.mockResolvedValue(createMinisterSession("min-A", "church-1"));

    await expect(
      RoleHoldersPage({ params: Promise.resolve({ role: "SECRETARY" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("pas de 404 pour un Ministre restreint sur un rôle assignable (DEPARTMENT_HEAD)", async () => {
    mockRequireAuth.mockResolvedValue(createMinisterSession("min-A", "church-1"));

    await expect(
      RoleHoldersPage({ params: Promise.resolve({ role: "DEPARTMENT_HEAD" }) })
    ).resolves.toBeDefined();
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("pas de 404 pour un Admin sur un rôle transverse (SECRETARY)", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession("church-1"));

    await expect(
      RoleHoldersPage({ params: Promise.resolve({ role: "SECRETARY" }) })
    ).resolves.toBeDefined();
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});
