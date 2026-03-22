import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createSession } from "@/__mocks__/auth";

const mockRequirePermission = vi.fn();
const mockGetDiscipleshipScope = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
  getDiscipleshipScope: (...args: unknown[]) => mockGetDiscipleshipScope(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: vi.fn(),
  RATE_LIMIT_MUTATION: {},
}));

const { POST } = await import("../route");

describe("POST /api/discipleships — cross-tenant member validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    mockGetDiscipleshipScope.mockResolvedValue({ scoped: false });
  });

  it("rejects creation with cross-church member references", async () => {
    // Only 1 of 2 members found in the target church
    prismaMock.member.findMany.mockResolvedValue([{ id: "m-maker" }]);
    prismaMock.discipleship.findUnique.mockResolvedValue(null);

    const request = new Request("http://localhost/api/discipleships", {
      method: "POST",
      body: JSON.stringify({
        discipleId: "m-disciple-other-church",
        discipleMakerId: "m-maker",
        churchId: "church-1",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("église");
  });

  it("allows creation with all members in same church", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      { id: "m-disciple" },
      { id: "m-maker" },
    ]);
    prismaMock.discipleship.findUnique.mockResolvedValue(null);
    prismaMock.discipleship.create.mockResolvedValue({
      id: "ds-new",
      discipleId: "m-disciple",
      discipleMakerId: "m-maker",
      firstMakerId: "m-maker",
      churchId: "church-1",
      disciple: { id: "m-disciple", firstName: "Jean", lastName: "A" },
      discipleMaker: { id: "m-maker", firstName: "Paul", lastName: "B" },
    });

    const request = new Request("http://localhost/api/discipleships", {
      method: "POST",
      body: JSON.stringify({
        discipleId: "m-disciple",
        discipleMakerId: "m-maker",
        churchId: "church-1",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(201);
  });

  it("rejects self-discipleship", async () => {
    prismaMock.member.findMany.mockResolvedValue([{ id: "m-same" }]);

    const request = new Request("http://localhost/api/discipleships", {
      method: "POST",
      body: JSON.stringify({
        discipleId: "m-same",
        discipleMakerId: "m-same",
        churchId: "church-1",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("propre FD");
  });

  it("rejects DISCIPLE_MAKER creating for someone else", async () => {
    const session = createSession({
      churchRoles: [{
        id: "role-1",
        churchId: "church-1",
        role: "DISCIPLE_MAKER",
        ministryId: null,
        church: { id: "church-1", name: "Test Church", slug: "test-church" },
        departments: [],
      }],
    });
    mockRequirePermission.mockResolvedValue(session);
    mockGetDiscipleshipScope.mockResolvedValue({ scoped: true, memberId: "m-my-id" });

    const request = new Request("http://localhost/api/discipleships", {
      method: "POST",
      body: JSON.stringify({
        discipleId: "m-disciple",
        discipleMakerId: "m-other-maker",
        churchId: "church-1",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(403);
  });
});
