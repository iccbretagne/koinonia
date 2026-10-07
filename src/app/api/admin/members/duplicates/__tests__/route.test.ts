import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession, createAuthScopeMocks } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  ...createAuthScopeMocks(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { GET } = await import("../route");

function get(query = "?churchId=church-1") {
  return GET(new Request(`http://localhost/api/admin/members/duplicates${query}`));
}

function member(id: string, firstName: string, lastName: string, email: string | null = null) {
  return { id, firstName, lastName, email, departments: [], userLinks: [], _count: {} };
}

describe("GET /api/admin/members/duplicates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
  });

  it("exige churchId", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
  });

  it("filtre les STAR au périmètre d'un responsable", async () => {
    mockRequireChurchPermission.mockResolvedValue(createDepartmentHeadSession([{ id: "dept-A", name: "A" }]));
    prismaMock.member.findMany.mockResolvedValue([]);
    await get();
    expect(prismaMock.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departments: { some: { departmentId: { in: ["dept-A"] } } } } })
    );
  });

  it("regroupe par nom normalisé et par email, et marque « both » quand les deux coïncident", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      member("m1", "Jean", "Dupont", "jean@x.fr"),
      member("m2", " jean ", "DUPONT", "JEAN@x.fr "),
      member("m3", "Anne", "Martin", "anne@x.fr"),
      member("m4", "Annie", "Martin", "anne@x.fr"),
      member("m5", "Paul", "Durand"),
      member("m6", "Paul", "Durand"),
      member("m7", "Seul", "Unique", "seul@x.fr"),
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    const groups = (await res.json()) as { reason: string; members: { id: string }[] }[];
    const summary = groups.map((g) => [g.reason, g.members.map((m) => m.id)]);
    expect(summary).toEqual([
      ["both", ["m1", "m2"]],
      ["same_name", ["m5", "m6"]],
      ["same_email", ["m3", "m4"]],
    ]);
  });

  it("ne renvoie aucun groupe sans doublon", async () => {
    prismaMock.member.findMany.mockResolvedValue([member("m1", "A", "B"), member("m2", "C", "D")]);
    const res = await get();
    expect(await res.json()).toEqual([]);
  });
});
