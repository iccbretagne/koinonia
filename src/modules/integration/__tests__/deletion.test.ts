import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { deleteIntegrationRequest } = await import("../services/deletion");

describe("deleteIntegrationRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("supprime historique, notifications (lien actuel et ancien lien) puis la demande", async () => {
    prismaMock.familyIntegrationRequest.deleteMany.mockResolvedValue({ count: 1 } as never);

    await deleteIntegrationRequest(prismaMock as never, { id: "int-1", churchId: "church-1" });

    expect(prismaMock.auditLog.deleteMany).toHaveBeenCalledWith({
      where: { entityType: "FamilyIntegrationRequest", entityId: "int-1" },
    });
    expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { entityType: "FamilyIntegrationRequest", entityId: "int-1" },
          { link: { in: ["/integration/requests/int-1", "/admin/integration/requests/int-1"] } },
        ],
      },
    });
    expect(prismaMock.familyIntegrationRequest.deleteMany).toHaveBeenCalledWith({
      where: { id: "int-1", churchId: "church-1" },
    });
    expect(prismaMock.notification.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.familyIntegrationRequest.deleteMany.mock.invocationCallOrder[0]
    );
  });

  it("404 si la demande n'existe pas dans cette église", async () => {
    prismaMock.familyIntegrationRequest.deleteMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      deleteIntegrationRequest(prismaMock as never, { id: "int-x", churchId: "church-1" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
