import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { matchesAudience, resolveRecipients, countAudience, isInAudience, loadViewerFacts } = await import(
  "../services/audience"
);

import type { Audience } from "../schemas";

const ALL: Audience = { roles: [], ministryIds: [], departmentIds: [], headsOnly: false };
const dept = (departmentId: string, ministryId: string) => ({ departmentId, department: { ministryId } });

/** Église C1 : ministère Louange (M1 : Choristes D1, Musiciens D2), Accueil (M2 : D3). */
function seedChurch() {
  prismaMock.userChurchRole.findMany.mockImplementation(async ({ where }: { where: { userId?: { in: string[] } } }) => {
    const rows = [
      { userId: "admin", role: "ADMIN", ministryId: null, departments: [] },
      { userId: "minister", role: "MINISTER", ministryId: "M1", departments: [] },
      { userId: "head", role: "DEPARTMENT_HEAD", ministryId: null, departments: [dept("D1", "M1")] },
      { userId: "star-d2", role: "STAR", ministryId: null, departments: [] },
      { userId: "star-d3", role: "STAR", ministryId: null, departments: [] },
      // Deux rôles pour la même personne : un seul destinataire.
      { userId: "head", role: "STAR", ministryId: null, departments: [] },
    ];
    return where.userId ? rows.filter((r) => where.userId!.in.includes(r.userId)) : rows;
  });
  prismaMock.memberUserLink.findMany.mockImplementation(async ({ where }: { where: { userId?: { in: string[] } } }) => {
    const rows = [
      { userId: "star-d2", member: { departments: [dept("D2", "M1")] } },
      { userId: "star-d3", member: { departments: [dept("D3", "M2")] } },
      // Fiche liée sans rôle dans l'église : aucun accès, aucun message.
      { userId: "ghost", member: { departments: [dept("D1", "M1")] } },
    ];
    return where.userId ? rows.filter((r) => where.userId!.in.includes(r.userId)) : rows;
  });
}

const recipients = async (audience: Partial<Audience>) =>
  (await resolveRecipients({ churchId: "C1", audience: { ...ALL, ...audience } })).sort();

describe("public d'un message système (spec 071)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedChurch();
  });

  it("toute l'église : chaque compte avec un rôle, une seule fois", async () => {
    expect(await recipients({})).toEqual(["admin", "head", "minister", "star-d2", "star-d3"]);
  });

  it("par rôle", async () => {
    expect(await recipients({ roles: ["STAR"] })).toEqual(["head", "star-d2", "star-d3"]);
    expect(await recipients({ roles: ["MINISTER", "DEPARTMENT_HEAD"] })).toEqual(["head", "minister"]);
  });

  it("par département : responsables et membres", async () => {
    expect(await recipients({ departmentIds: ["D1"] })).toEqual(["head"]);
    expect(await recipients({ departmentIds: ["D2"] })).toEqual(["star-d2"]);
    expect(await recipients({ departmentIds: ["D2", "D3"] })).toEqual(["star-d2", "star-d3"]);
  });

  it("par ministère : Ministre, responsables et membres de ses départements", async () => {
    expect(await recipients({ ministryIds: ["M1"] })).toEqual(["minister", "star-d2"]);
  });

  it("responsables seulement", async () => {
    expect(await recipients({ ministryIds: ["M1"], headsOnly: true })).toEqual(["minister"]);
    expect(await recipients({ departmentIds: ["D1", "D2"], headsOnly: true })).toEqual(["head"]);
  });

  it("ET entre rôles et départements", async () => {
    expect(await recipients({ roles: ["STAR"], departmentIds: ["D2", "D3"] })).toEqual(["star-d2", "star-d3"]);
    expect(await recipients({ roles: ["ADMIN"], departmentIds: ["D2"] })).toEqual([]);
  });

  it("instance : par rôle, toutes églises confondues", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "a" }, { userId: "b" }]);
    expect(await resolveRecipients({ churchId: null, audience: { ...ALL, roles: ["ADMIN"] } })).toEqual(["a", "b"]);
    expect(prismaMock.userChurchRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: { in: ["ADMIN"] } }, distinct: ["userId"] })
    );
  });

  it("décompte : fiches STAR sans compte, seulement si des membres sont visés", async () => {
    prismaMock.member.count.mockResolvedValue(4);
    expect(await countAudience({ churchId: "C1", audience: { ...ALL, departmentIds: ["D2"] } })).toEqual({
      recipients: 1,
      membersWithoutAccount: 4,
    });
    expect(
      await countAudience({ churchId: "C1", audience: { ...ALL, departmentIds: ["D2"], headsOnly: true } })
    ).toEqual({ recipients: 0, membersWithoutAccount: 0 });
    expect(await countAudience({ churchId: "C1", audience: { ...ALL, roles: ["ADMIN"] } })).toEqual({
      recipients: 1,
      membersWithoutAccount: 0,
    });
  });

  it("isInAudience donne le même résultat que resolveRecipients", async () => {
    const audiences: Partial<Audience>[] = [
      {},
      { roles: ["STAR"] },
      { departmentIds: ["D2"] },
      { ministryIds: ["M1"], headsOnly: true },
      { roles: ["STAR"], departmentIds: ["D3"] },
    ];
    for (const a of audiences) {
      const audience: Audience = { ...ALL, ...a };
      const expected = await resolveRecipients({ churchId: "C1", audience });
      for (const userId of ["admin", "minister", "head", "star-d2", "star-d3", "ghost"]) {
        const facts = await loadViewerFacts(userId, ["C1"]);
        expect(isInAudience({ churchId: "C1", audience }, facts), `${userId} ${JSON.stringify(a)}`).toBe(
          expected.includes(userId)
        );
      }
    }
  });

  it("pas de faits dans l'église du message : hors public (aucune fuite entre églises)", () => {
    expect(matchesAudience({ ...ALL }, undefined)).toBe(false);
    expect(isInAudience({ churchId: "C2", audience: { ...ALL } }, new Map())).toBe(false);
  });
});
