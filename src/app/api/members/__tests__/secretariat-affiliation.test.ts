import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createAuthScopeMocks,
  createDepartmentHeadSession,
  createMinisterSession,
  fakeHasChurchPermission,
} from "@/__mocks__/auth";

/**
 * Un rattachement à un département de fonction Secrétariat donne au compte lié le rôle virtuel
 * Secrétaire. Il ne peut donc venir que de qui peut nommer un Secrétaire (`access:admins`), et
 * un responsable ne rattache jamais une fiche hors de son périmètre, même en département
 * supplémentaire.
 */

const mockRequireChurchPermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  resolveChurchId: vi.fn(async () => "church-1"),
  hasChurchPermission: fakeHasChurchPermission,
  ...createAuthScopeMocks(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const membersRoute = await import("../route");
const memberRoute = await import("../[memberId]/route");
const attachRoute = await import("../[memberId]/departments/route");
const linkRoute = await import("../../member-user-links/route");

const headOfA = () => createDepartmentHeadSession([{ id: "dept-a", name: "A" }, { id: "dept-sec", name: "Secrétariat" }]);
const json = (body: unknown, method = "POST") => ({ method, body: JSON.stringify(body) });
const memberParams = (memberId: string) => ({ params: Promise.resolve({ memberId }) });

describe("rattachement au Secrétariat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.member.findMany.mockResolvedValue([]);
    // Départements de l'église, filtrés comme le ferait la base sur `id: { in }`
    prismaMock.department.findMany.mockImplementation((async (args: { where?: { id?: { in?: string[] } } }) =>
      ["dept-a", "dept-b", "dept-sec"]
        .filter((id) => !args.where?.id?.in || args.where.id.in.includes(id))
        .map((id) => ({ id, ministry: { churchId: "church-1" } }))) as never);
    // `count` des départements Secrétariat visés : 1 dès que dept-sec, ou la fiche m-sec qui y
    // est rattachée, est concerné
    prismaMock.department.count.mockImplementation((async (args: { where: unknown }) =>
      /dept-sec|m-sec/.test(JSON.stringify(args.where)) ? 1 : 0) as never);
  });

  it("création : un département supplémentaire hors périmètre est refusé, rien n'est créé", async () => {
    mockRequireChurchPermission.mockResolvedValue(createDepartmentHeadSession([{ id: "dept-a", name: "A" }]));

    const res = await membersRoute.POST(
      new Request("http://k.test/api/members", json({ firstName: "X", lastName: "Y", departmentId: "dept-a", additionalDepartmentIds: ["dept-b"] }))
    );

    expect(res.status).toBe(403);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
  });

  it("création : même dans son périmètre, un responsable ne rattache pas au Secrétariat", async () => {
    mockRequireChurchPermission.mockResolvedValue(headOfA());

    const res = await membersRoute.POST(
      new Request("http://k.test/api/members", json({ firstName: "X", lastName: "Y", email: "x@exemple.fr", departmentId: "dept-a", additionalDepartmentIds: ["dept-sec"] }))
    );

    expect(res.status).toBe(403);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
  });

  it("création : un Admin rattache au Secrétariat", async () => {
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    prismaMock.member.create.mockResolvedValue({ id: "m-new", departments: [] } as never);

    const res = await membersRoute.POST(
      new Request("http://k.test/api/members", json({ firstName: "X", lastName: "Y", departmentId: "dept-a", additionalDepartmentIds: ["dept-sec"] }))
    );

    expect(res.status).toBe(201);
  });

  it("modification : un responsable n'ajoute pas le Secrétariat à une fiche", async () => {
    mockRequireChurchPermission.mockResolvedValue(headOfA());
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m1",
      email: null,
      departments: [{ departmentId: "dept-a", isPrimary: true }],
    } as never);

    const res = await memberRoute.PUT(
      new Request("http://k.test/api/members/m1", json({ firstName: "X", lastName: "Y", departmentId: "dept-a", additionalDepartmentIds: ["dept-sec"] }, "PUT")),
      memberParams("m1")
    );

    expect(res.status).toBe(403);
    expect(prismaMock.member.update).not.toHaveBeenCalled();
  });

  it("modification : un responsable ne change pas l'email d'une fiche déjà au Secrétariat", async () => {
    mockRequireChurchPermission.mockResolvedValue(headOfA());
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m1",
      email: "ancien@exemple.fr",
      departments: [
        { departmentId: "dept-a", isPrimary: true },
        { departmentId: "dept-sec", isPrimary: false },
      ],
    } as never);

    const res = await memberRoute.PUT(
      new Request(
        "http://k.test/api/members/m1",
        json({ firstName: "X", lastName: "Y", email: "nouveau@exemple.fr", departmentId: "dept-a", additionalDepartmentIds: ["dept-sec"] }, "PUT")
      ),
      memberParams("m1")
    );

    expect(res.status).toBe(403);
    expect(prismaMock.member.update).not.toHaveBeenCalled();
  });

  it("rattachement d'un STAR existant au Secrétariat : refusé à un responsable", async () => {
    mockRequireChurchPermission.mockResolvedValue(headOfA());

    const res = await attachRoute.POST(
      new Request("http://k.test/api/members/m1/departments", json({ departmentId: "dept-sec" })),
      memberParams("m1")
    );

    expect(res.status).toBe(403);
    expect(prismaMock.memberDepartment.create).not.toHaveBeenCalled();
  });

  it("liaison d'un compte à une fiche du Secrétariat : refusée à un Ministre", async () => {
    mockRequireChurchPermission.mockResolvedValue(createMinisterSession("ministry-1"));
    prismaMock.member.findFirst.mockResolvedValue({ id: "m-sec", departments: [{ departmentId: "dept-sec" }] } as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: "m-sec", departments: [{ departmentId: "dept-sec", department: { ministryId: "ministry-1" } }] } as never);

    const res = await linkRoute.POST(
      new Request("http://k.test/api/member-user-links", json({ memberId: "m-sec", churchId: "church-1", userId: "u-2" }))
    );

    expect(res.status).toBe(403);
    expect(prismaMock.memberUserLink.create).not.toHaveBeenCalled();
  });
});
