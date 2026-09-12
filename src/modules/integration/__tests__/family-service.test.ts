import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockSendEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const { runInactivityNotifications } = await import("../services/family-service");

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    churchId: "church-1",
    status: "SUBMITTED",
    firstName: "Marie",
    lastName: "Curie",
    updatedAt: new Date(Date.now() - 10 * 86_400_000),
    assignedBerger: null,
    church: { id: "church-1", name: "ICC Rennes" },
    ...overrides,
  };
}

describe("runInactivityNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.notification.create.mockResolvedValue({} as never);
  });

  it("Intégration portée par deux départements : une personne membre des deux n'est notifiée qu'une fois (spec 046)", async () => {
    prismaMock.familyIntegrationRequest.findMany.mockResolvedValue([makeRequest()] as never);
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-int-1" }, { id: "dept-int-2" }] as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { userChurchRole: { userId: "manager-1", user: { id: "manager-1", email: "manager@example.com" } } },
      { userChurchRole: { userId: "manager-1", user: { id: "manager-1", email: "manager@example.com" } } },
    ] as never);

    const result = await runInactivityNotifications("https://koinonia.example");

    expect(prismaMock.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ function: "INTEGRATION" }) })
    );
    expect(prismaMock.userDepartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentId: { in: ["dept-int-1", "dept-int-2"] } } })
    );
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(result.notified).toBe(1);
  });

  it("aucun département INTEGRATION configuré : pas de notification, pas d'erreur", async () => {
    prismaMock.familyIntegrationRequest.findMany.mockResolvedValue([makeRequest()] as never);
    prismaMock.department.findMany.mockResolvedValue([] as never);

    const result = await runInactivityNotifications("https://koinonia.example");

    expect(prismaMock.userDepartment.findMany).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
  });
});
