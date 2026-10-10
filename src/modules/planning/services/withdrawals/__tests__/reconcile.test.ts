import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { reconcileWithdrawalsAfterGridEdit } from "../reconcile";

const db = prismaMock as never;
const base = { eventId: "evt-1", departmentId: "dept-1", actorId: "marie" };

describe("reconcileWithdrawalsAfterGridEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.serviceWithdrawal.findMany.mockResolvedValue([
      { id: "w-old", memberId: "paul" },
      { id: "w-new", memberId: "jean" },
    ] as never);
    prismaMock.serviceWithdrawal.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.member.findMany.mockResolvedValue([
      { id: "lea", firstName: "Léa", lastName: "Bernard" },
      { id: "zoe", firstName: "Zoé", lastName: "Adam" },
    ] as never);
  });

  it("le STAR désisté replacé dans la grille : son désistement est annulé", async () => {
    const filled = await reconcileWithdrawalsAfterGridEdit(db, {
      ...base,
      before: new Map([["paul", null]]),
      after: [{ memberId: "paul", status: "EN_SERVICE" }],
    });
    expect(filled).toEqual([]);
    expect(prismaMock.serviceWithdrawal.updateMany).toHaveBeenCalledWith({
      where: { id: "w-old", status: "PENDING" },
      data: expect.objectContaining({ status: "CANCELLED", resolvedById: "marie" }),
    });
  });

  it("un membre ajouté pourvoit le plus ancien désistement", async () => {
    const filled = await reconcileWithdrawalsAfterGridEdit(db, {
      ...base,
      before: new Map(),
      after: [{ memberId: "lea", status: "EN_SERVICE" }],
    });
    expect(filled).toEqual([{ withdrawalId: "w-old", replacementName: "Léa Bernard" }]);
    expect(prismaMock.serviceWithdrawal.updateMany).toHaveBeenCalledOnce();
    expect(prismaMock.serviceWithdrawal.updateMany).toHaveBeenCalledWith({
      where: { id: "w-old", status: "PENDING" },
      data: expect.objectContaining({ status: "REPLACED", replacementMemberId: "lea" }),
    });
  });

  it("plusieurs ajouts : un désistement par membre ajouté, dans l'ordre", async () => {
    const filled = await reconcileWithdrawalsAfterGridEdit(db, {
      ...base,
      before: new Map(),
      after: [
        { memberId: "lea", status: "EN_SERVICE" },
        { memberId: "zoe", status: "REMPLACANT" },
      ],
    });
    expect(filled.map((f) => f.withdrawalId)).toEqual(["w-old", "w-new"]);
  });

  it("idempotent : un membre déjà planifié avant l'écriture ne pourvoit rien", async () => {
    const filled = await reconcileWithdrawalsAfterGridEdit(db, {
      ...base,
      before: new Map([["lea", "EN_SERVICE"]]),
      after: [{ memberId: "lea", status: "EN_SERVICE" }],
    });
    expect(filled).toEqual([]);
    expect(prismaMock.serviceWithdrawal.updateMany).not.toHaveBeenCalled();
  });

  it("sans désistement en attente : rien à faire", async () => {
    prismaMock.serviceWithdrawal.findMany.mockResolvedValue([]);
    expect(
      await reconcileWithdrawalsAfterGridEdit(db, { ...base, before: new Map(), after: [{ memberId: "lea", status: "EN_SERVICE" }] })
    ).toEqual([]);
  });
});
