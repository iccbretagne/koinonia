import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createSuperAdminSession,
  createSecretarySession,
  createPastoralCareReferentSession,
  createMinisterSession,
  createDepartmentHeadSession,
} from "@/__mocks__/auth";

const mockAuth = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({
    auth: mockAuth,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});

const { requireCareQualify, getCareAccess } = await import("@/modules/care/auth");

describe("requireCareQualify", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows Super Admin", async () => {
    mockAuth.mockResolvedValue(createSuperAdminSession());
    const session = await requireCareQualify("church-1");
    expect(session.user.isSuperAdmin).toBe(true);
  });

  it("allows Admin", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    const session = await requireCareQualify("church-1");
    expect(session.user.id).toBe("user-1");
  });

  it("allows Référent soins pastoraux (PASTORAL_CARE_REFERENT)", async () => {
    mockAuth.mockResolvedValue(createPastoralCareReferentSession("church-1"));
    const session = await requireCareQualify("church-1");
    expect(session.user.id).toBe("user-1");
  });

  it("denies Secrétaire (care:view seul, pas care:qualify)", async () => {
    mockAuth.mockResolvedValue(createSecretarySession("church-1"));
    await expect(requireCareQualify("church-1")).rejects.toThrow("FORBIDDEN");
  });

  it("denies un Ministre — aucune approximation par members:manage (#583)", async () => {
    mockAuth.mockResolvedValue(createMinisterSession("ministry-1", "church-1"));
    await expect(requireCareQualify("church-1")).rejects.toThrow("FORBIDDEN");
  });

  it("denies un Responsable de département — aucune approximation par members:manage (#583)", async () => {
    mockAuth.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-1", name: "Son" }], "church-1")
    );
    await expect(requireCareQualify("church-1")).rejects.toThrow("FORBIDDEN");
  });
});

describe("getCareAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.pastoralProfile.findMany.mockResolvedValue([]);
  });

  it("Super Admin : canQualify et canOverview", async () => {
    const session = createSuperAdminSession();
    const access = await getCareAccess(session, "church-1");
    expect(access.canQualify).toBe(true);
    expect(access.canOverview).toBe(true);
  });

  it("Admin : canQualify et canOverview", async () => {
    const session = createAdminSession("church-1");
    const access = await getCareAccess(session, "church-1");
    expect(access.canQualify).toBe(true);
    expect(access.canOverview).toBe(true);
  });

  it("Référent soins pastoraux : canQualify et canOverview", async () => {
    const session = createPastoralCareReferentSession("church-1");
    const access = await getCareAccess(session, "church-1");
    expect(access.canQualify).toBe(true);
    expect(access.canOverview).toBe(true);
  });

  it("Secrétaire : care:view seul (canOverview sans canQualify)", async () => {
    const session = createSecretarySession("church-1");
    const access = await getCareAccess(session, "church-1");
    expect(access.canQualify).toBe(false);
    expect(access.canOverview).toBe(true);
  });

  it("Ministre : aucun accès (ni canQualify ni canOverview) — #583", async () => {
    const session = createMinisterSession("ministry-1", "church-1");
    const access = await getCareAccess(session, "church-1");
    expect(access.canQualify).toBe(false);
    expect(access.canOverview).toBe(false);
  });

  it("Responsable de département : aucun accès — #583", async () => {
    const session = createDepartmentHeadSession([{ id: "dept-1", name: "Son" }], "church-1");
    const access = await getCareAccess(session, "church-1");
    expect(access.canQualify).toBe(false);
    expect(access.canOverview).toBe(false);
  });

  it("ne lève jamais — un accompagnant sans droit reçoit canQualify/canOverview à false", async () => {
    const session = createMinisterSession("ministry-1", "church-1");
    await expect(getCareAccess(session, "church-1")).resolves.toBeDefined();
  });

  it("expose les profils pastoraux rattachés au compte (ownProfileIds)", async () => {
    prismaMock.pastoralProfile.findMany.mockResolvedValue([{ id: "profile-1" }]);
    const session = createMinisterSession("ministry-1", "church-1");
    const access = await getCareAccess(session, "church-1");
    expect(access.ownProfileIds).toEqual(["profile-1"]);
  });
});
