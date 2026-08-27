import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createSession } from "@/__mocks__/auth";

const mockAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});

const { getCaptureDepartmentId, isCaptureTeamMember, isCaptureTeamLead } = await import("../access");
const { requireAudioAccess, requireAudioUnpublishAccess } = await import("@/lib/auth");

const churchId = "church-1";
const captureDepartmentId = "dept-son";

describe("getCaptureDepartmentId / isCaptureTeamMember", () => {
  beforeEach(() => vi.clearAllMocks());

  it("null si le module n'est pas configuré pour cette église", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue(null);
    expect(await getCaptureDepartmentId(churchId)).toBeNull();
    expect(await isCaptureTeamMember(churchId, ["dept-x"])).toBe(false);
  });

  it("faux si aucun des départements de l'utilisateur ne correspond", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue({ captureDepartmentId } as never);
    expect(await isCaptureTeamMember(churchId, ["dept-autre"])).toBe(false);
  });

  it("vrai si un des départements est le département de captation, quel que soit le rôle", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue({ captureDepartmentId } as never);
    expect(await isCaptureTeamMember(churchId, ["dept-autre", captureDepartmentId])).toBe(true);
  });

  it("faux immédiatement si l'utilisateur n'a aucun département (pas de requête inutile)", async () => {
    expect(await isCaptureTeamMember(churchId, [])).toBe(false);
    expect(prismaMock.audioSettings.findUnique).not.toHaveBeenCalled();
  });
});

describe("isCaptureTeamLead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("faux pour un STAR du département de captation (pas responsable)", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue({ captureDepartmentId } as never);
    const session = createSession({
      churchRoles: [
        {
          id: "role-1",
          churchId,
          role: "STAR",
          ministryId: null,
          church: { id: churchId, name: "Test Church", slug: "test-church" },
          departments: [{ department: { id: captureDepartmentId, name: "Son" } }],
        },
      ],
    });
    expect(await isCaptureTeamLead(session, churchId)).toBe(false);
  });

  it("vrai pour un DEPARTMENT_HEAD du département de captation", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue({ captureDepartmentId } as never);
    const session = createSession({
      churchRoles: [
        {
          id: "role-1",
          churchId,
          role: "DEPARTMENT_HEAD",
          ministryId: null,
          church: { id: churchId, name: "Test Church", slug: "test-church" },
          departments: [{ department: { id: captureDepartmentId, name: "Son" } }],
        },
      ],
    });
    expect(await isCaptureTeamLead(session, churchId)).toBe(true);
  });

  it("vrai pour un MINISTER du département de captation", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue({ captureDepartmentId } as never);
    const session = createSession({
      churchRoles: [
        {
          id: "role-1",
          churchId,
          role: "MINISTER",
          ministryId: "min-1",
          church: { id: churchId, name: "Test Church", slug: "test-church" },
          departments: [{ department: { id: captureDepartmentId, name: "Son" } }],
        },
      ],
    });
    expect(await isCaptureTeamLead(session, churchId)).toBe(true);
  });

  it("faux pour un DEPARTMENT_HEAD d'un autre département", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue({ captureDepartmentId } as never);
    const session = createSession({
      churchRoles: [
        {
          id: "role-1",
          churchId,
          role: "DEPARTMENT_HEAD",
          ministryId: null,
          church: { id: churchId, name: "Test Church", slug: "test-church" },
          departments: [{ department: { id: "dept-autre", name: "Louange" } }],
        },
      ],
    });
    expect(await isCaptureTeamLead(session, churchId)).toBe(false);
  });
});

describe("requireAudioAccess / requireAudioUnpublishAccess (src/lib/auth.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passe pour un rôle global disposant de la permission (ADMIN → audio:view)", async () => {
    mockAuth.mockResolvedValue(createAdminSession(churchId));

    const session = await requireAudioAccess("audio:view", churchId);
    expect(session.user.id).toBe("user-1");
    // ADMIN a la permission de rôle — pas besoin d'interroger le département de captation
    expect(prismaMock.audioSettings.findUnique).not.toHaveBeenCalled();
  });

  it("passe pour un membre du département de captation sans permission de rôle (STAR)", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue({ captureDepartmentId } as never);
    mockAuth.mockResolvedValue(
      createSession({
        churchRoles: [
          {
            id: "role-1",
            churchId,
            role: "STAR",
            ministryId: null,
            church: { id: churchId, name: "Test Church", slug: "test-church" },
            departments: [{ department: { id: captureDepartmentId, name: "Son" } }],
          },
        ],
      })
    );

    const session = await requireAudioAccess("audio:view", churchId);
    expect(session.user.id).toBe("user-1");
  });

  it("rejette un STAR sans permission de rôle et hors du département de captation", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue({ captureDepartmentId } as never);
    mockAuth.mockResolvedValue(
      createSession({
        churchRoles: [
          {
            id: "role-1",
            churchId,
            role: "STAR",
            ministryId: null,
            church: { id: churchId, name: "Test Church", slug: "test-church" },
            departments: [{ department: { id: "dept-autre", name: "Louange" } }],
          },
        ],
      })
    );

    await expect(requireAudioAccess("audio:view", churchId)).rejects.toThrow("FORBIDDEN");
  });

  it("rejette un utilisateur d'une autre église (cross-tenant)", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-2"));

    await expect(requireAudioAccess("audio:view", churchId)).rejects.toThrow("FORBIDDEN");
  });

  it("unpublish : refuse un STAR du département de captation", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue({ captureDepartmentId } as never);
    mockAuth.mockResolvedValue(
      createSession({
        churchRoles: [
          {
            id: "role-1",
            churchId,
            role: "STAR",
            ministryId: null,
            church: { id: churchId, name: "Test Church", slug: "test-church" },
            departments: [{ department: { id: captureDepartmentId, name: "Son" } }],
          },
        ],
      })
    );

    await expect(requireAudioUnpublishAccess(churchId)).rejects.toThrow("FORBIDDEN");
  });

  it("unpublish : accepte un DEPARTMENT_HEAD du département de captation", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue({ captureDepartmentId } as never);
    mockAuth.mockResolvedValue(
      createSession({
        churchRoles: [
          {
            id: "role-1",
            churchId,
            role: "DEPARTMENT_HEAD",
            ministryId: null,
            church: { id: churchId, name: "Test Church", slug: "test-church" },
            departments: [{ department: { id: captureDepartmentId, name: "Son" } }],
          },
        ],
      })
    );

    const session = await requireAudioUnpublishAccess(churchId);
    expect(session.user.id).toBe("user-1");
  });

  it("unpublish : accepte un MINISTER du département de captation", async () => {
    prismaMock.audioSettings.findUnique.mockResolvedValue({ captureDepartmentId } as never);
    mockAuth.mockResolvedValue(
      createSession({
        churchRoles: [
          {
            id: "role-1",
            churchId,
            role: "MINISTER",
            ministryId: "min-1",
            church: { id: churchId, name: "Test Church", slug: "test-church" },
            departments: [{ department: { id: captureDepartmentId, name: "Son" } }],
          },
        ],
      })
    );

    const session = await requireAudioUnpublishAccess(churchId);
    expect(session.user.id).toBe("user-1");
  });

  it("unpublish : accepte audio:manage (ADMIN) sans regarder le département", async () => {
    mockAuth.mockResolvedValue(createAdminSession(churchId));

    const session = await requireAudioUnpublishAccess(churchId);
    expect(session.user.id).toBe("user-1");
    expect(prismaMock.audioSettings.findUnique).not.toHaveBeenCalled();
  });
});
