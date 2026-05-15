import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createSuperAdminSession,
  createSecretarySession,
  createAgendaQualifierSession,
  createDepartmentHeadSession,
  createProtocoleMemberSession,
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

const { isProtocoleMember, requireAgendaView, requireAgendaManage, requireAgendaQualify } =
  await import("@/modules/agenda/auth");

describe("isProtocoleMember", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when user has a PROTOCOLE dept in the church", async () => {
    const session = createProtocoleMemberSession("dept-protocole", "church-1");
    prismaMock.department.count.mockResolvedValue(1);
    expect(await isProtocoleMember(session, "church-1")).toBe(true);
  });

  it("returns false when user has no departments in the church", async () => {
    const session = createAdminSession("church-1");
    expect(await isProtocoleMember(session, "church-2")).toBe(false);
    expect(prismaMock.department.count).not.toHaveBeenCalled();
  });

  it("returns false when department is not PROTOCOLE function", async () => {
    const session = createDepartmentHeadSession([{ id: "dept-1", name: "Son" }], "church-1");
    prismaMock.department.count.mockResolvedValue(0);
    expect(await isProtocoleMember(session, "church-1")).toBe(false);
  });

  it("returns false when dept belongs to another church (cross-tenant)", async () => {
    const session = createProtocoleMemberSession("dept-protocole", "church-2");
    prismaMock.department.count.mockResolvedValue(0);
    expect(await isProtocoleMember(session, "church-1")).toBe(false);
  });
});

describe("requireAgendaView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows super admin", async () => {
    mockAuth.mockResolvedValue(createSuperAdminSession());
    const session = await requireAgendaView("church-1");
    expect(session.user.isSuperAdmin).toBe(true);
  });

  it("allows admin (has agenda:view)", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    const session = await requireAgendaView("church-1");
    expect(session.user.id).toBe("user-1");
  });

  it("allows secretary (has agenda:view)", async () => {
    mockAuth.mockResolvedValue(createSecretarySession("church-1"));
    const session = await requireAgendaView("church-1");
    expect(session.user.id).toBe("user-1");
  });

  it("denies AGENDA_QUALIFIER (removed from agenda:view — T03)", async () => {
    mockAuth.mockResolvedValue(createAgendaQualifierSession("church-1"));
    await expect(requireAgendaView("church-1")).rejects.toThrow("FORBIDDEN");
  });

  it("allows PROTOCOLE member via isProtocoleMember", async () => {
    const session = createProtocoleMemberSession("dept-protocole", "church-1");
    mockAuth.mockResolvedValue(session);
    prismaMock.department.count.mockResolvedValue(1);
    const result = await requireAgendaView("church-1");
    expect(result.user.id).toBe("user-1");
  });

  it("denies user with no role in the church", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-2"));
    await expect(requireAgendaView("church-1")).rejects.toThrow("FORBIDDEN");
  });

  it("denies unauthenticated user", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireAgendaView("church-1")).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("requireAgendaManage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows admin (has agenda:manage)", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    const session = await requireAgendaManage("church-1");
    expect(session.user.id).toBe("user-1");
  });

  it("allows PROTOCOLE member", async () => {
    const session = createProtocoleMemberSession("dept-protocole", "church-1");
    mockAuth.mockResolvedValue(session);
    prismaMock.department.count.mockResolvedValue(1);
    const result = await requireAgendaManage("church-1");
    expect(result.user.id).toBe("user-1");
  });

  it("denies AGENDA_QUALIFIER (has no agenda:manage)", async () => {
    mockAuth.mockResolvedValue(createAgendaQualifierSession("church-1"));
    prismaMock.department.count.mockResolvedValue(0);
    await expect(requireAgendaManage("church-1")).rejects.toThrow("FORBIDDEN");
  });

  it("denies department head (has no agenda:manage)", async () => {
    mockAuth.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-1", name: "Son" }], "church-1")
    );
    prismaMock.department.count.mockResolvedValue(0);
    await expect(requireAgendaManage("church-1")).rejects.toThrow("FORBIDDEN");
  });
});

describe("requireAgendaQualify", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows AGENDA_QUALIFIER", async () => {
    mockAuth.mockResolvedValue(createAgendaQualifierSession("church-1"));
    const session = await requireAgendaQualify("church-1");
    expect(session.user.id).toBe("user-1");
  });

  it("allows admin (has agenda:qualify)", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    const session = await requireAgendaQualify("church-1");
    expect(session.user.id).toBe("user-1");
  });

  it("denies PROTOCOLE member (no agenda:qualify)", async () => {
    const session = createProtocoleMemberSession("dept-protocole", "church-1");
    mockAuth.mockResolvedValue(session);
    await expect(requireAgendaQualify("church-1")).rejects.toThrow("FORBIDDEN");
  });

  it("denies secretary (no agenda:qualify)", async () => {
    mockAuth.mockResolvedValue(createSecretarySession("church-1"));
    await expect(requireAgendaQualify("church-1")).rejects.toThrow("FORBIDDEN");
  });
});
