// Comportement demandé en conversation : retirer un STAR de son dernier département réel ne
// refuse plus — il bascule vers le département système « Sans département » (parking), déjà
// utilisé pour un disciple créé sans fiche STAR. Symétriquement, rattacher un vrai département
// retire ce parking s'il y était, pour ne jamais le laisser cumulé à un vrai département.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { attachMemberToDepartment, detachMemberFromDepartment } = await import("@/modules/planning");

const CHURCH_ID = "church-1";
const SYS_DEPT_ID = "sys-dept-1";

describe("detachMemberFromDepartment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dernier département réel : bascule vers le département système au lieu de refuser", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "member-1",
      departments: [{ departmentId: "dept-real", isPrimary: true }],
    } as never);
    prismaMock.department.findFirst.mockResolvedValue({ id: SYS_DEPT_ID } as never);
    prismaMock.member.findUniqueOrThrow.mockResolvedValue({ id: "member-1" } as never);

    await detachMemberFromDepartment("member-1", "dept-real", CHURCH_ID, prismaMock as never);

    expect(prismaMock.department.findFirst).toHaveBeenCalledWith({
      where: { isSystem: true, ministry: { churchId: CHURCH_ID } },
      select: { id: true },
    });
    expect(prismaMock.memberDepartment.deleteMany).toHaveBeenCalledWith({
      where: { memberId: "member-1", departmentId: "dept-real" },
    });
    expect(prismaMock.memberDepartment.create).toHaveBeenCalledWith({
      data: { memberId: "member-1", departmentId: SYS_DEPT_ID, isPrimary: true },
    });
    // Pas de bascule de département principal vers un "next" inexistant
    expect(prismaMock.memberDepartment.update).not.toHaveBeenCalled();
  });

  it("retirer le département système lui-même quand c'est le dernier : refuse toujours", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "member-1",
      departments: [{ departmentId: SYS_DEPT_ID, isPrimary: true }],
    } as never);
    prismaMock.department.findFirst.mockResolvedValue({ id: SYS_DEPT_ID } as never);

    await expect(
      detachMemberFromDepartment("member-1", SYS_DEPT_ID, CHURCH_ID, prismaMock as never)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.memberDepartment.deleteMany).not.toHaveBeenCalled();
  });

  it("département système introuvable pour l'église : erreur explicite plutôt qu'un crash", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "member-1",
      departments: [{ departmentId: "dept-real", isPrimary: true }],
    } as never);
    prismaMock.department.findFirst.mockResolvedValue(null);

    await expect(
      detachMemberFromDepartment("member-1", "dept-real", CHURCH_ID, prismaMock as never)
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("pas la dernière affiliation : comportement inchangé (retrait simple, pas de parking)", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "member-1",
      departments: [
        { departmentId: "dept-a", isPrimary: true },
        { departmentId: "dept-b", isPrimary: false },
      ],
    } as never);
    prismaMock.member.findUniqueOrThrow.mockResolvedValue({ id: "member-1" } as never);

    await detachMemberFromDepartment("member-1", "dept-a", CHURCH_ID, prismaMock as never);

    expect(prismaMock.department.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.memberDepartment.create).not.toHaveBeenCalled();
    expect(prismaMock.memberDepartment.update).toHaveBeenCalledWith({
      where: { memberId_departmentId: { memberId: "member-1", departmentId: "dept-b" } },
      data: { isPrimary: true },
    });
  });
});

describe("attachMemberToDepartment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rattacher un vrai département quand le STAR n'avait que le parking système : le retire", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "member-1",
      departments: [
        { departmentId: SYS_DEPT_ID, department: { ministry: { churchId: CHURCH_ID } } },
      ],
    } as never);
    prismaMock.department.findFirst.mockResolvedValue({ id: SYS_DEPT_ID } as never);
    prismaMock.member.findUniqueOrThrow.mockResolvedValue({ id: "member-1" } as never);

    await attachMemberToDepartment("member-1", "dept-real", CHURCH_ID, prismaMock as never);

    expect(prismaMock.memberDepartment.create).toHaveBeenCalledWith({
      data: { memberId: "member-1", departmentId: "dept-real", isPrimary: true },
    });
    expect(prismaMock.memberDepartment.deleteMany).toHaveBeenCalledWith({
      where: { memberId: "member-1", departmentId: SYS_DEPT_ID },
    });
  });

  it("rattacher un vrai département quand le STAR en a déjà un autre : pas de parking à retirer", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "member-1",
      departments: [
        { departmentId: "dept-a", department: { ministry: { churchId: CHURCH_ID } } },
      ],
    } as never);
    prismaMock.department.findFirst.mockResolvedValue({ id: SYS_DEPT_ID } as never);
    prismaMock.member.findUniqueOrThrow.mockResolvedValue({ id: "member-1" } as never);

    await attachMemberToDepartment("member-1", "dept-b", CHURCH_ID, prismaMock as never);

    expect(prismaMock.memberDepartment.create).toHaveBeenCalledWith({
      data: { memberId: "member-1", departmentId: "dept-b", isPrimary: false },
    });
    expect(prismaMock.memberDepartment.deleteMany).not.toHaveBeenCalled();
  });
});
