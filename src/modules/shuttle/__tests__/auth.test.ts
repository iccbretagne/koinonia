import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession } from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const { getShuttleAccess } = await import("../auth");

function session(role: Role, opts: { churchId?: string; departments?: string[]; ministryId?: string | null } = {}): Session {
  const churchId = opts.churchId ?? "church-1";
  return createSession({
    id: "user-1",
    churchRoles: [
      {
        id: "r",
        churchId,
        role,
        ministryId: opts.ministryId ?? null,
        church: { id: churchId, name: "ICC", slug: "icc" },
        departments: (opts.departments ?? []).map((id) => ({ department: { id, name: id }, isDeputy: false })),
      },
    ] as Session["user"]["churchRoles"],
  });
}

describe("accès au registre de la navette (spec 073)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-nav", ministryId: "min-1" }]);
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    prismaMock.memberDepartment.count.mockResolvedValue(0);
  });

  it.each<Role>(["ADMIN", "ACCOUNTANT"])("%s est gestionnaire", async (role) => {
    expect(await getShuttleAccess(session(role), "church-1", prismaMock as never)).toMatchObject({ manager: true });
  });

  it.each<Role>(["SECRETARY", "STAR", "DEPARTMENT_HEAD", "MINISTER"])("%s hors équipe n'a aucun accès", async (role) => {
    expect(await getShuttleAccess(session(role), "church-1", prismaMock as never)).toEqual({ manager: false, member: false, hasTeam: true });
  });

  it("un STAR dont la fiche est dans le département Navette est membre", async () => {
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "m1" });
    prismaMock.memberDepartment.count.mockResolvedValue(1);
    expect(await getShuttleAccess(session("STAR"), "church-1", prismaMock as never)).toMatchObject({ manager: false, member: true });
    expect(prismaMock.memberDepartment.count).toHaveBeenCalledWith({ where: { memberId: "m1", departmentId: { in: ["dept-nav"] } } });
  });

  it("le responsable du département et le Ministre du ministère sont membres", async () => {
    expect((await getShuttleAccess(session("DEPARTMENT_HEAD", { departments: ["dept-nav"] }), "church-1", prismaMock as never)).member).toBe(true);
    expect((await getShuttleAccess(session("MINISTER", { ministryId: "min-1" }), "church-1", prismaMock as never)).member).toBe(true);
  });

  it("un responsable d'un département d'une autre fonction n'est pas membre", async () => {
    expect((await getShuttleAccess(session("DEPARTMENT_HEAD", { departments: ["dept-son"] }), "church-1", prismaMock as never)).member).toBe(false);
  });

  it("aucun droit dans une autre église", async () => {
    expect(await getShuttleAccess(session("ADMIN", { churchId: "church-2" }), "church-1", prismaMock as never)).toMatchObject({ manager: false, member: false });
  });

  it("sans département Navette, personne n'est membre", async () => {
    prismaMock.department.findMany.mockResolvedValue([]);
    expect(await getShuttleAccess(session("ADMIN"), "church-1", prismaMock as never)).toEqual({ manager: true, member: false, hasTeam: false });
  });
});
