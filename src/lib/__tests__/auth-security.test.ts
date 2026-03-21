import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createSuperAdminSession,
  createDepartmentHeadSession,
} from "@/__mocks__/auth";

// Mock auth() to return a configurable session
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
// Override the auth export that requireAuth uses internally
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...original,
    auth: () => mockAuth(),
  };
});

const {
  requireChurchPermission,
  requireChurchAccess,
  resolveChurchId,
} = await import("@/lib/auth");

describe("requireChurchPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows access for admin in the correct church", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));

    const session = await requireChurchPermission("events:view", "church-1");
    expect(session.user.id).toBe("user-1");
  });

  it("rejects admin from church-1 accessing church-2", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));

    await expect(
      requireChurchPermission("events:view", "church-2")
    ).rejects.toThrow("FORBIDDEN");
  });

  it("rejects user with no roles in target church", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));

    await expect(
      requireChurchPermission("events:view", "church-999")
    ).rejects.toThrow("FORBIDDEN");
  });

  it("rejects when user has role but lacks specific permission", async () => {
    // Department head does NOT have departments:manage
    mockAuth.mockResolvedValue(
      createDepartmentHeadSession(
        [{ id: "dept-1", name: "Son" }],
        "church-1"
      )
    );

    await expect(
      requireChurchPermission("departments:manage", "church-1")
    ).rejects.toThrow("FORBIDDEN");
  });

  it("allows department head with correct permission in correct church", async () => {
    mockAuth.mockResolvedValue(
      createDepartmentHeadSession(
        [{ id: "dept-1", name: "Son" }],
        "church-1"
      )
    );

    // Department head HAS planning:view
    const session = await requireChurchPermission("planning:view", "church-1");
    expect(session.user.id).toBe("user-1");
  });

  it("super admin bypasses all church checks", async () => {
    mockAuth.mockResolvedValue(createSuperAdminSession());

    // Super admin can access any church even if not in their churchRoles
    const session = await requireChurchPermission("church:manage", "church-999");
    expect(session.user.isSuperAdmin).toBe(true);
  });

  it("rejects unauthenticated user", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(
      requireChurchPermission("events:view", "church-1")
    ).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("requireChurchAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows user with any role in the church", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));

    const session = await requireChurchAccess("church-1");
    expect(session.user.id).toBe("user-1");
  });

  it("rejects user with no role in the church", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));

    await expect(requireChurchAccess("church-2")).rejects.toThrow("FORBIDDEN");
  });

  it("super admin can access any church", async () => {
    mockAuth.mockResolvedValue(createSuperAdminSession());

    const session = await requireChurchAccess("church-999");
    expect(session.user.isSuperAdmin).toBe(true);
  });
});

describe("resolveChurchId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves churchId from event", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ churchId: "church-1" });

    const churchId = await resolveChurchId("event", "evt-1");
    expect(churchId).toBe("church-1");
    expect(prismaMock.event.findUnique).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      select: { churchId: true },
    });
  });

  it("resolves churchId from department via ministry", async () => {
    prismaMock.department.findUnique.mockResolvedValue({
      ministry: { churchId: "church-2" },
    });

    const churchId = await resolveChurchId("department", "dept-1");
    expect(churchId).toBe("church-2");
  });

  it("resolves churchId from member via department.ministry", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      department: { ministry: { churchId: "church-3" } },
    });

    const churchId = await resolveChurchId("member", "member-1");
    expect(churchId).toBe("church-3");
  });

  it("resolves churchId from ministry", async () => {
    prismaMock.ministry.findUnique.mockResolvedValue({ churchId: "church-1" });

    const churchId = await resolveChurchId("ministry", "min-1");
    expect(churchId).toBe("church-1");
  });

  it("throws 404 when event not found", async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);

    await expect(resolveChurchId("event", "nonexistent")).rejects.toThrow(
      "Événement introuvable"
    );
  });

  it("throws 404 when department not found", async () => {
    prismaMock.department.findUnique.mockResolvedValue(null);

    await expect(resolveChurchId("department", "nonexistent")).rejects.toThrow(
      "Département introuvable"
    );
  });

  it("throws 404 when member not found", async () => {
    prismaMock.member.findUnique.mockResolvedValue(null);

    await expect(resolveChurchId("member", "nonexistent")).rejects.toThrow(
      "Membre introuvable"
    );
  });

  it("throws 404 when ministry not found", async () => {
    prismaMock.ministry.findUnique.mockResolvedValue(null);

    await expect(resolveChurchId("ministry", "nonexistent")).rejects.toThrow(
      "Ministère introuvable"
    );
  });
});

describe("multi-tenant isolation scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin of church-1 cannot manage events in church-2", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));

    // Event belongs to church-2
    prismaMock.event.findUnique.mockResolvedValue({ churchId: "church-2" });

    const churchId = await resolveChurchId("event", "evt-church2");
    expect(churchId).toBe("church-2");

    // Permission check fails because admin is only in church-1
    await expect(
      requireChurchPermission("events:manage", churchId)
    ).rejects.toThrow("FORBIDDEN");
  });

  it("admin of church-1 cannot view members in church-2", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));

    prismaMock.member.findUnique.mockResolvedValue({
      department: { ministry: { churchId: "church-2" } },
    });

    const churchId = await resolveChurchId("member", "member-church2");
    await expect(
      requireChurchPermission("members:view", churchId)
    ).rejects.toThrow("FORBIDDEN");
  });

  it("department head in church-1 cannot access departments in church-2", async () => {
    mockAuth.mockResolvedValue(
      createDepartmentHeadSession(
        [{ id: "dept-1", name: "Son" }],
        "church-1"
      )
    );

    prismaMock.department.findUnique.mockResolvedValue({
      ministry: { churchId: "church-2" },
    });

    const churchId = await resolveChurchId("department", "dept-church2");
    await expect(
      requireChurchPermission("planning:view", churchId)
    ).rejects.toThrow("FORBIDDEN");
  });

  it("user with roles in multiple churches can only access their own churches", async () => {
    // User has ADMIN in church-1 and DEPARTMENT_HEAD in church-2
    const multiChurchSession = {
      user: {
        id: "user-multi",
        email: "multi@example.com",
        name: "Multi User",
        displayName: null,
        image: null,
        isSuperAdmin: false,
        hasSeenTour: false,
        churchRoles: [
          {
            id: "role-1",
            churchId: "church-1",
            role: "ADMIN" as const,
            ministryId: null,
            church: { id: "church-1", name: "Church A", slug: "church-a" },
            departments: [],
          },
          {
            id: "role-2",
            churchId: "church-2",
            role: "DEPARTMENT_HEAD" as const,
            ministryId: null,
            church: { id: "church-2", name: "Church B", slug: "church-b" },
            departments: [{ department: { id: "dept-b1", name: "Son" } }],
          },
        ],
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    };

    mockAuth.mockResolvedValue(multiChurchSession);

    // Can manage events in church-1 (ADMIN has events:manage)
    await expect(
      requireChurchPermission("events:manage", "church-1")
    ).resolves.toBeDefined();

    // Cannot manage events in church-2 (DEPARTMENT_HEAD lacks events:manage)
    await expect(
      requireChurchPermission("events:manage", "church-2")
    ).rejects.toThrow("FORBIDDEN");

    // Can view planning in church-2 (DEPARTMENT_HEAD has planning:view)
    await expect(
      requireChurchPermission("planning:view", "church-2")
    ).resolves.toBeDefined();

    // Cannot access church-3 at all
    await expect(
      requireChurchPermission("events:view", "church-3")
    ).rejects.toThrow("FORBIDDEN");
  });
});
