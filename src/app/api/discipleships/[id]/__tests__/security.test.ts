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

const { PATCH, DELETE } = await import("../route");

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

const existingDiscipleship = {
  id: "ds-1",
  discipleId: "m-disciple",
  discipleMakerId: "m-maker-1",
  firstMakerId: "m-maker-1",
  churchId: "church-1",
};

describe("PATCH /api/discipleships/[id] — scope enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.discipleship.findUnique.mockResolvedValue(existingDiscipleship);
  });

  it("allows admin to reassign any discipleship", async () => {
    mockRequirePermission.mockResolvedValue(createAdminSession());
    mockGetDiscipleshipScope.mockResolvedValue({ scoped: false });
    prismaMock.member.findMany.mockResolvedValue([{ id: "m-maker-2" }]);
    prismaMock.discipleship.update.mockResolvedValue({
      ...existingDiscipleship,
      discipleMakerId: "m-maker-2",
      disciple: { id: "m-disciple", firstName: "Jean", lastName: "A" },
      discipleMaker: { id: "m-maker-2", firstName: "Paul", lastName: "B" },
      firstMaker: { id: "m-maker-1", firstName: "Pierre", lastName: "C" },
    });

    const request = new Request("http://localhost/api/discipleships/ds-1", {
      method: "PATCH",
      body: JSON.stringify({ discipleMakerId: "m-maker-2" }),
    });
    const res = await PATCH(request, makeParams("ds-1"));

    expect(res.status).toBe(200);
  });

  it("rejects DISCIPLE_MAKER modifying someone else's disciple", async () => {
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
    // Scoped to m-other-maker, not the owner of this discipleship
    mockGetDiscipleshipScope.mockResolvedValue({ scoped: true, memberId: "m-other-maker" });

    const request = new Request("http://localhost/api/discipleships/ds-1", {
      method: "PATCH",
      body: JSON.stringify({ discipleMakerId: "m-maker-2" }),
    });
    const res = await PATCH(request, makeParams("ds-1"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("propres disciples");
  });

  it("allows DISCIPLE_MAKER to modify their own disciple", async () => {
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
    mockGetDiscipleshipScope.mockResolvedValue({ scoped: true, memberId: "m-maker-1" });
    prismaMock.member.findMany.mockResolvedValue([{ id: "m-maker-2" }]);
    prismaMock.discipleship.update.mockResolvedValue({
      ...existingDiscipleship,
      discipleMakerId: "m-maker-2",
      disciple: { id: "m-disciple", firstName: "Jean", lastName: "A" },
      discipleMaker: { id: "m-maker-2", firstName: "Paul", lastName: "B" },
      firstMaker: { id: "m-maker-1", firstName: "Pierre", lastName: "C" },
    });

    const request = new Request("http://localhost/api/discipleships/ds-1", {
      method: "PATCH",
      body: JSON.stringify({ discipleMakerId: "m-maker-2" }),
    });
    const res = await PATCH(request, makeParams("ds-1"));

    expect(res.status).toBe(200);
  });

  it("rejects cross-church discipleMakerId", async () => {
    mockRequirePermission.mockResolvedValue(createAdminSession());
    mockGetDiscipleshipScope.mockResolvedValue({ scoped: false });
    // New maker not found in same church
    prismaMock.member.findMany.mockResolvedValue([]);

    const request = new Request("http://localhost/api/discipleships/ds-1", {
      method: "PATCH",
      body: JSON.stringify({ discipleMakerId: "m-other-church" }),
    });
    const res = await PATCH(request, makeParams("ds-1"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("église");
  });

  it("rejects self-assignment", async () => {
    mockRequirePermission.mockResolvedValue(createAdminSession());
    mockGetDiscipleshipScope.mockResolvedValue({ scoped: false });

    const request = new Request("http://localhost/api/discipleships/ds-1", {
      method: "PATCH",
      body: JSON.stringify({ discipleMakerId: "m-disciple" }),
    });
    const res = await PATCH(request, makeParams("ds-1"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("propre FD");
  });
});

describe("DELETE /api/discipleships/[id] — scope enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.discipleship.findUnique.mockResolvedValue(existingDiscipleship);
  });

  it("rejects DISCIPLE_MAKER deleting someone else's disciple", async () => {
    mockRequirePermission.mockResolvedValue(createSession({
      churchRoles: [{
        id: "role-1",
        churchId: "church-1",
        role: "DISCIPLE_MAKER",
        ministryId: null,
        church: { id: "church-1", name: "Test Church", slug: "test-church" },
        departments: [],
      }],
    }));
    mockGetDiscipleshipScope.mockResolvedValue({ scoped: true, memberId: "m-other-maker" });

    const request = new Request("http://localhost/api/discipleships/ds-1", { method: "DELETE" });
    const res = await DELETE(request, makeParams("ds-1"));

    expect(res.status).toBe(403);
  });

  it("allows DISCIPLE_MAKER to delete their own disciple", async () => {
    mockRequirePermission.mockResolvedValue(createSession({
      churchRoles: [{
        id: "role-1",
        churchId: "church-1",
        role: "DISCIPLE_MAKER",
        ministryId: null,
        church: { id: "church-1", name: "Test Church", slug: "test-church" },
        departments: [],
      }],
    }));
    mockGetDiscipleshipScope.mockResolvedValue({ scoped: true, memberId: "m-maker-1" });
    prismaMock.discipleship.delete.mockResolvedValue(existingDiscipleship);

    const request = new Request("http://localhost/api/discipleships/ds-1", { method: "DELETE" });
    const res = await DELETE(request, makeParams("ds-1"));

    expect(res.status).toBe(200);
  });
});
