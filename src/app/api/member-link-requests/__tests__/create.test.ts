import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAuthScopeMocks } from "@/__mocks__/auth";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  requireChurchPermission: vi.fn(),
  ...createAuthScopeMocks(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: vi.fn(),
  RATE_LIMIT_SENSITIVE: { windowMs: 60000, max: 10 },
}));
const mockNotifyUsers = vi.fn();
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...args: unknown[]) => mockNotifyUsers(...args) }));

const { POST } = await import("../route");

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/member-link-requests", { method: "POST", body: JSON.stringify(body) })
  );
}

const session = { user: { id: "user-1", displayName: null, name: "Jean", email: "jean@example.com" } };

function memberWith(churchId: string | undefined, userLinks: unknown[] = []) {
  prismaMock.member.findUnique.mockResolvedValue({
    id: "member-1",
    userLinks,
    departments: churchId ? [{ department: { ministry: { churchId } } }] : [],
  });
}

describe("POST /api/member-link-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(session);
    prismaMock.memberLinkRequest.findFirst.mockResolvedValue(null);
    prismaMock.memberUserLink.findFirst.mockResolvedValue(null);
    prismaMock.memberLinkRequest.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "req-1", ...data }));
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "admin-1" }]);
  });

  it("refuse un appelant non connecté", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await post({ type: "no_star", churchId: "church-1", requestedRole: "REPORTER" });
    expect(res.status).toBe(401);
  });

  it("refuse une deuxième demande en attente dans la même église", async () => {
    prismaMock.memberLinkRequest.findFirst.mockResolvedValue({ id: "req-0" });
    const res = await post({ type: "no_star", churchId: "church-1", requestedRole: "REPORTER" });
    expect(res.status).toBe(409);
    expect(prismaMock.memberLinkRequest.create).not.toHaveBeenCalled();
  });

  it("refuse un compte déjà lié à un STAR de l'église", async () => {
    prismaMock.memberUserLink.findFirst.mockResolvedValue({ id: "link-1" });
    const res = await post({ type: "no_star", churchId: "church-1", requestedRole: "REPORTER" });
    expect(res.status).toBe(409);
  });

  it("crée une demande sans STAR et prévient l'administration de l'église", async () => {
    const res = await post({ type: "no_star", churchId: "church-1", requestedRole: "DISCIPLE_MAKER", notes: "FD" });
    expect(res.status).toBe(201);
    expect(prismaMock.memberLinkRequest.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        churchId: "church-1",
        requestedRole: "DISCIPLE_MAKER",
        notes: "FD",
        departmentId: undefined,
        ministryId: undefined,
      },
    });
    expect(mockNotifyUsers).toHaveBeenCalledWith(
      ["admin-1"],
      expect.objectContaining({ domain: "account", type: "MEMBER_LINK_REQUEST", message: expect.stringContaining("Jean") })
    );
  });

  it("ne prévient personne quand l'église n'a pas d'administration", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    const res = await post({ type: "no_star", churchId: "church-1", requestedRole: "REPORTER" });
    expect(res.status).toBe(201);
    expect(mockNotifyUsers).not.toHaveBeenCalled();
  });

  it("rattache une demande à un STAR existant de l'église", async () => {
    memberWith("church-1");
    const res = await post({ type: "existing", memberId: "member-1", churchId: "church-1", departmentId: "dept-1" });
    expect(res.status).toBe(201);
    expect(prismaMock.memberLinkRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ memberId: "member-1", departmentId: "dept-1", requestedRole: null }),
    });
  });

  it("refuse un STAR introuvable", async () => {
    prismaMock.member.findUnique.mockResolvedValue(null);
    const res = await post({ type: "existing", memberId: "member-1", churchId: "church-1" });
    expect(res.status).toBe(404);
  });

  it("refuse un STAR déjà lié à un compte", async () => {
    memberWith("church-1", [{ id: "link-1" }]);
    const res = await post({ type: "existing", memberId: "member-1", churchId: "church-1" });
    expect(res.status).toBe(409);
  });

  it("refuse un STAR d'une autre église", async () => {
    memberWith("church-2");
    const res = await post({ type: "existing", memberId: "member-1", churchId: "church-1" });
    expect(res.status).toBe(400);
    expect(prismaMock.memberLinkRequest.create).not.toHaveBeenCalled();
  });

  it("crée une demande de nouveau STAR avec son identité", async () => {
    const res = await post({ type: "new", firstName: "Anne", lastName: "Durand", phone: "0600", churchId: "church-1" });
    expect(res.status).toBe(201);
    expect(prismaMock.memberLinkRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ firstName: "Anne", lastName: "Durand", phone: "0600" }),
    });
  });

  it("nomme le demandeur par son email à défaut de nom", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", displayName: null, name: null, email: "anon@example.com" } });
    await post({ type: "new", firstName: "Anne", lastName: "Durand", churchId: "church-1" });
    expect(mockNotifyUsers).toHaveBeenCalledWith(
      ["admin-1"],
      expect.objectContaining({ message: expect.stringContaining("anon@example.com") })
    );
  });
});
