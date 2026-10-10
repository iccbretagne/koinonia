import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { resolveWithdrawalRecipients } from "../recipients";

const db = prismaMock as never;

function heads(...userIds: string[]) {
  prismaMock.userDepartment.findMany.mockResolvedValue(userIds.map((userId) => ({ userChurchRole: { userId } })) as never);
}

describe("resolveWithdrawalRecipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);
    prismaMock.department.findUnique.mockResolvedValue({ ministryId: "min-1" } as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "minister-1" }] as never);
  });

  it("responsable principal et adjoints du département, sans Ministre en copie", async () => {
    heads("head-1", "deputy-1");
    expect(await resolveWithdrawalRecipients("church-1", "dept-1", "m-1", db)).toEqual(["head-1", "deputy-1"]);
    expect(prismaMock.userDepartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentId: "dept-1", userChurchRole: { churchId: "church-1", role: "DEPARTMENT_HEAD" } } })
    );
    expect(prismaMock.userChurchRole.findMany).not.toHaveBeenCalled();
  });

  it("le responsable qui se désiste lui-même prévient les autres responsables", async () => {
    heads("head-1", "deputy-1");
    prismaMock.memberUserLink.findMany.mockResolvedValue([{ userId: "head-1" }] as never);
    expect(await resolveWithdrawalRecipients("church-1", "dept-1", "m-1", db)).toEqual(["deputy-1"]);
  });

  it("à défaut d'autre responsable : les Ministres du ministère", async () => {
    heads("head-1");
    prismaMock.memberUserLink.findMany.mockResolvedValue([{ userId: "head-1" }] as never);
    expect(await resolveWithdrawalRecipients("church-1", "dept-1", "m-1", db)).toEqual(["minister-1"]);
    expect(prismaMock.userChurchRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-1", role: "MINISTER", ministryId: "min-1" } })
    );
  });

  it("département sans responsable : le Ministre", async () => {
    heads();
    expect(await resolveWithdrawalRecipients("church-1", "dept-1", "m-1", db)).toEqual(["minister-1"]);
  });
});
