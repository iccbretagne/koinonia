/** Files de la comptabilité (spec 092) : mêmes règles que les indicateurs de `/finances/demandes`. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { accountingQueueCounts, toJustifyWhere, toPayWhere, toValidateWhere } = await import("../queue");

beforeEach(() => vi.clearAllMocks());

describe("accountingQueueCounts", () => {
  it("toutes les règles sont bornées à l'église", () => {
    expect(toValidateWhere("ch1")).toEqual({ churchId: "ch1", status: { in: ["SUBMITTED", "PROCESSING"] } });
    expect(toPayWhere("ch1")).toEqual({ releasedAt: null, request: { churchId: "ch1" } });
    expect(toJustifyWhere("ch1")).toEqual({ churchId: "ch1", justification: { is: { status: { not: "SETTLED" } } } });
  });

  it("à valider (par statut), à payer, justificatifs non soldés", async () => {
    prismaMock.financialRequest.groupBy.mockResolvedValue([
      { status: "SUBMITTED", _count: { _all: 3 } },
      { status: "PROCESSING", _count: { _all: 1 } },
    ]);
    prismaMock.financialPayment.count.mockResolvedValue(5);
    prismaMock.financialRequest.count.mockResolvedValue(2);
    await expect(accountingQueueCounts("ch1")).resolves.toEqual({ submitted: 3, processing: 1, toPay: 5, toJustify: 2 });
  });

  it("aucun élément : des zéros", async () => {
    prismaMock.financialRequest.groupBy.mockResolvedValue([]);
    prismaMock.financialPayment.count.mockResolvedValue(0);
    prismaMock.financialRequest.count.mockResolvedValue(0);
    await expect(accountingQueueCounts("ch1")).resolves.toEqual({ submitted: 0, processing: 0, toPay: 0, toJustify: 0 });
  });
});
