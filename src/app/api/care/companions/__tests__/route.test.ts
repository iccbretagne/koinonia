import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createSecretarySession } from "@/__mocks__/auth";

const mockAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});

const { GET, PUT } = await import("../route");

const churchId = "church-1";

function resetCandidateMocks() {
  prismaMock.pastoralProfile.findMany.mockResolvedValue([] as never);
  prismaMock.department.findMany.mockResolvedValue([] as never);
  prismaMock.memberUserLink.findMany.mockResolvedValue([] as never);
  prismaMock.userChurchRole.findMany.mockResolvedValue([] as never);
  prismaMock.careCompanion.findMany.mockResolvedValue([] as never);
  prismaMock.appointmentRequest.groupBy.mockResolvedValue([] as never);
  prismaMock.msdpFollowUp.groupBy.mockResolvedValue([] as never);
}

describe("GET /api/care/companions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(createAdminSession(churchId));
    resetCandidateMocks();
  });

  it("renvoie profils et STAR accompagnants (vivier calculé, spec 056)", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-msdp" }] as never);
    prismaMock.memberUserLink.findMany.mockResolvedValue([
      { user: { id: "u1", name: "Alice", email: "alice@example.com" }, member: { departments: [] } },
    ] as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "u1" }] as never);

    const res = await GET(new Request(`https://koinonia.test/api/care/companions?churchId=${churchId}`));
    const body = await res.json();

    expect(body.members.map((c: { id: string }) => c.id)).toEqual(["u1"]);
  });

  it("refuse un lecteur sans care:qualify (Secrétaire, care:view seul)", async () => {
    mockAuth.mockResolvedValue(createSecretarySession(churchId));

    const res = await GET(new Request(`https://koinonia.test/api/care/companions?churchId=${churchId}`));

    expect(res.status).toBe(403);
  });

  it("400 quand churchId est manquant", async () => {
    const res = await GET(new Request("https://koinonia.test/api/care/companions"));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/care/companions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(createAdminSession(churchId));
    resetCandidateMocks();
  });

  function putRequest(body: unknown) {
    return new Request("https://koinonia.test/api/care/companions", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  it("ajoute un STAR hors MSDP", async () => {
    prismaMock.memberUserLink.findMany.mockResolvedValue([
      { user: { id: "u1", name: "Alice", email: null }, member: { departments: [] } },
    ] as never);
    prismaMock.careCompanion.upsert.mockResolvedValue({} as never);

    const res = await PUT(putRequest({ churchId, userId: "u1", state: "ADDED" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.state).toBe("ADDED");
    expect(prismaMock.careCompanion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ churchId, userId: "u1", mode: "ADDED" }),
      })
    );
  });

  it("400 sur un state invalide", async () => {
    const res = await PUT(putRequest({ churchId, userId: "u1", state: "AUTRE" }));
    expect(res.status).toBe(400);
    expect(prismaMock.careCompanion.upsert).not.toHaveBeenCalled();
  });

  it("refuse un lecteur sans care:qualify (Secrétaire)", async () => {
    mockAuth.mockResolvedValue(createSecretarySession(churchId));

    const res = await PUT(putRequest({ churchId, userId: "u1", state: "ADDED" }));

    expect(res.status).toBe(403);
    expect(prismaMock.careCompanion.upsert).not.toHaveBeenCalled();
  });
});
