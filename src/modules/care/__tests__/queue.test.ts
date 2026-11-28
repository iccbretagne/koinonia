/** File « Rendez-vous et suivis à confier » (spec 092) : pastilles des onglets de `/pastoral/suivi`. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { careQueueCounts } = await import("../services/queue");

beforeEach(() => vi.clearAllMocks());

describe("careQueueCounts", () => {
  it("sans care:qualify : aucune file (null, pas 0) et aucune requête", async () => {
    await expect(careQueueCounts({ canQualify: false }, "ch1")).resolves.toBeNull();
    expect(prismaMock.appointmentRequest.count).not.toHaveBeenCalled();
    expect(prismaMock.msdpFollowUp.count).not.toHaveBeenCalled();
  });

  it("care:qualify : demandes en attente et suivis soumis de l'église seulement", async () => {
    prismaMock.appointmentRequest.count.mockResolvedValue(2);
    prismaMock.msdpFollowUp.count.mockResolvedValue(1);
    await expect(careQueueCounts({ canQualify: true }, "ch1")).resolves.toEqual({ requests: 2, followUps: 1 });
    expect(prismaMock.appointmentRequest.count).toHaveBeenCalledWith({ where: { churchId: "ch1", status: "PENDING" } });
    expect(prismaMock.msdpFollowUp.count).toHaveBeenCalledWith({ where: { churchId: "ch1", status: "SUBMITTED" } });
  });
});
