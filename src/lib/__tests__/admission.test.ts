/**
 * Tests — admitToChurch() (spec 037 : rattachement à une nouvelle église)
 *
 * Extraite de la transaction d'approbation d'une demande de liaison ; les tests de
 * non-régression de cette route (member-link-requests/[id]/__tests__/route.test.ts, T1)
 * couvrent déjà son comportement observable via ce chemin. Ceux-ci testent le service
 * directement, pour les cas que le second appelant (member-user-links) exerce aussi.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { admitToChurch } = await import("../admission");

// prismaMock expose les mêmes méthodes que le client transactionnel Prisma (`tx`) — utilisé
// tel quel comme client transactionnel dans ces tests, comme partout ailleurs dans le repo.
const tx = prismaMock as never;

describe("admitToChurch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ displayName: null } as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.memberUserLink.create.mockResolvedValue({} as never);
  });

  it("attribue le rôle STAR si la personne n'a encore aucun rôle dans l'église", async () => {
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);

    const result = await admitToChurch(tx, {
      userId: "user-1",
      churchId: "church-1",
      validatedById: "admin-1",
      memberId: "member-1",
    });

    expect(prismaMock.userChurchRole.create).toHaveBeenCalledWith({
      data: { userId: "user-1", churchId: "church-1", role: "STAR" },
    });
    expect(result.starRoleAssigned).toBe(true);
  });

  it("n'attribue pas de rôle STAR si la personne a déjà un rôle dans l'église", async () => {
    prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "existing-role" } as never);

    const result = await admitToChurch(tx, {
      userId: "user-1",
      churchId: "church-1",
      validatedById: "admin-1",
      memberId: "member-1",
    });

    expect(prismaMock.userChurchRole.create).not.toHaveBeenCalled();
    expect(result.starRoleAssigned).toBe(false);
  });

  it("crée le Member pour une nouvelle fiche STAR, dans le département fourni", async () => {
    prismaMock.department.findUnique.mockResolvedValue({
      id: "dept-1",
      ministry: { churchId: "church-1" },
    } as never);
    prismaMock.member.create.mockResolvedValue({
      id: "member-new",
      firstName: "Emmanuella",
      lastName: "Sohou",
    } as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);

    const result = await admitToChurch(tx, {
      userId: "user-1",
      churchId: "church-1",
      validatedById: "admin-1",
      newMember: { firstName: "Emmanuella", lastName: "Sohou", departmentId: "dept-1" },
    });

    expect(prismaMock.member.create).toHaveBeenCalledWith({
      data: {
        firstName: "Emmanuella",
        lastName: "Sohou",
        phone: undefined,
        departments: { create: { departmentId: "dept-1", isPrimary: true } },
      },
    });
    expect(result.memberId).toBe("member-new");
  });

  it("refuse si le département de la nouvelle fiche n'appartient pas à l'église", async () => {
    prismaMock.department.findUnique.mockResolvedValue({
      id: "dept-1",
      ministry: { churchId: "AUTRE-EGLISE" },
    } as never);

    await expect(
      admitToChurch(tx, {
        userId: "user-1",
        churchId: "church-1",
        validatedById: "admin-1",
        newMember: { firstName: "E", lastName: "S", departmentId: "dept-1" },
      })
    ).rejects.toThrow(/n'appartient pas à cette église/);
  });

  it("refuse si le ministère du rôle Ministre n'appartient pas à l'église", async () => {
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.ministry.findUnique.mockResolvedValue({ churchId: "AUTRE-EGLISE" } as never);

    await expect(
      admitToChurch(tx, {
        userId: "user-1",
        churchId: "church-1",
        validatedById: "admin-1",
        memberId: "member-1",
        requestedRole: "MINISTER",
        ministryId: "ministry-1",
      })
    ).rejects.toThrow(/n'appartient pas à cette église/);
  });

  it("n'écrase pas le displayName déjà renseigné (rattachement dans une seconde église)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ displayName: "Nom de l'église A" } as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);

    await admitToChurch(tx, {
      userId: "user-1",
      churchId: "church-1",
      validatedById: "admin-1",
      memberId: "member-1",
    });

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("renseigne le displayName s'il est vide", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ displayName: null } as never);
    prismaMock.member.findUnique.mockResolvedValue({ firstName: "Jean", lastName: "Dupont" } as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);

    await admitToChurch(tx, {
      userId: "user-1",
      churchId: "church-1",
      validatedById: "admin-1",
      memberId: "member-1",
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { displayName: "Jean Dupont" },
    });
  });

  it("n'accorde ni lien ni rôle dans une autre église que celle passée en paramètre", async () => {
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);

    await admitToChurch(tx, {
      userId: "user-1",
      churchId: "church-B",
      validatedById: "admin-1",
      memberId: "member-1",
    });

    expect(prismaMock.memberUserLink.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ churchId: "church-B" }) })
    );
    expect(prismaMock.userChurchRole.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ churchId: "church-B" }) })
    );
    // Aucun appel ne mentionne une autre église que celle demandée.
    for (const call of prismaMock.userChurchRole.create.mock.calls) {
      expect(call[0].data.churchId).toBe("church-B");
    }
  });
});
