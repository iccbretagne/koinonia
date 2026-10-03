import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: vi.fn(async () => createAdminSession()),
  resolveChurchId: vi.fn(async () => "church-1"),
  requireDepartmentAccess: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const mockNotifyUsers = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notifyUsers: (...args: unknown[]) => mockNotifyUsers(...args),
  createNotification: vi.fn(),
}));
const mockRecord = vi.fn();
vi.mock("@/modules/planning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/planning")>()),
  getPlanningAvailability: vi.fn(),
  recordPlanningChanges: (...args: unknown[]) => mockRecord(...args),
}));

const { PUT } = await import("../route");

const put = (plannings: { memberId: string; status: string | null }[]) =>
  PUT(
    new Request("http://localhost", { method: "PUT", body: JSON.stringify({ plannings }) }),
    { params: Promise.resolve({ eventId: "evt-1", deptId: "dept-1" }) }
  );

describe("PUT grille de planning — changements regroupés (spec 060)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecord.mockResolvedValue({ recorded: 0 });
    prismaMock.department.findUnique.mockResolvedValue({ ministry: { churchId: "church-1" } } as never);
    prismaMock.event.findUnique.mockResolvedValue({ planningDeadline: null, title: "Culte" } as never);
    prismaMock.eventDepartment.findUnique.mockResolvedValue({ id: "ed-1" } as never);
    prismaMock.member.findMany.mockImplementation((args: { where: { id: { in: string[] } } }) =>
      Promise.resolve(args.where.id.in.map((id) => ({ id })))
    );
    prismaMock.planning.upsert.mockResolvedValue({});
  });

  it("n'envoie plus aucune notification à l'enregistrement", async () => {
    prismaMock.planning.findMany.mockResolvedValue([]);

    const res = await put([{ memberId: "m-1", status: "EN_SERVICE" }]);

    expect(res.status).toBe(200);
    expect(mockNotifyUsers).not.toHaveBeenCalled();
  });

  it("enregistre les changements avec le statut d'origine, et seulement ceux qui changent", async () => {
    prismaMock.planning.findMany.mockResolvedValue([
      { memberId: "m-2", status: "REMPLACANT" },
      { memberId: "m-3", status: "EN_SERVICE" },
    ] as never);

    await put([
      { memberId: "m-1", status: "EN_SERVICE" }, // ajouté
      { memberId: "m-2", status: "EN_SERVICE" }, // remplaçant → en service
      { memberId: "m-3", status: "EN_SERVICE" }, // inchangé
      { memberId: "m-4", status: null }, // absent, reste absent
    ]);

    expect(mockRecord).toHaveBeenCalledTimes(1);
    const [, churchId, changes, opts] = mockRecord.mock.calls[0];
    expect(churchId).toBe("church-1");
    expect(changes).toEqual([
      { memberId: "m-1", eventId: "evt-1", departmentId: "dept-1", previousStatus: null },
      { memberId: "m-2", eventId: "evt-1", departmentId: "dept-1", previousStatus: "REMPLACANT" },
    ]);
    expect(opts).toEqual({ actorId: createAdminSession().user.id });
  });

  it("retirer un STAR enregistre son statut d'origine", async () => {
    prismaMock.planning.findMany.mockResolvedValue([{ memberId: "m-1", status: "EN_SERVICE" }] as never);

    await put([{ memberId: "m-1", status: null }]);

    expect(mockRecord.mock.calls[0][2]).toEqual([
      { memberId: "m-1", eventId: "evt-1", departmentId: "dept-1", previousStatus: "EN_SERVICE" },
    ]);
  });

  it("un échec d'enregistrement n'empêche pas l'enregistrement du planning", async () => {
    prismaMock.planning.findMany.mockResolvedValue([]);
    mockRecord.mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await put([{ memberId: "m-1", status: "EN_SERVICE" }]);

    expect(res.status).toBe(200);
    expect(prismaMock.planning.upsert).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
