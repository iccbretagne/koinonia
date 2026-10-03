import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: vi.fn(async () => createAdminSession()),
  resolveChurchId: vi.fn(async () => "church-1"),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const mockRecordRemoved = vi.fn();
vi.mock("@/modules/planning", () => ({
  planningBus: { emit: vi.fn() },
  recordRemovedPlannings: (...args: unknown[]) => mockRecordRemoved(...args),
}));

const { DELETE } = await import("../route");

const del = (body: Record<string, unknown>) =>
  DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify(body) }), {
    params: Promise.resolve({ eventId: "evt-1" }),
  });

describe("DELETE retrait d'un département — changements regroupés (spec 060)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.department.findUnique.mockResolvedValue({ ministry: { churchId: "church-1" } } as never);
  });

  it("enregistre les STAR planifiés avant de supprimer les plannings (événement seul)", async () => {
    prismaMock.eventDepartment.findUnique.mockResolvedValue({ id: "ed-1" } as never);
    prismaMock.planning.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.eventDepartment.delete.mockResolvedValue({});
    const order: string[] = [];
    mockRecordRemoved.mockImplementation(async () => void order.push("record"));
    prismaMock.planning.deleteMany.mockImplementation(async () => (order.push("delete"), { count: 2 }));

    const res = await del({ departmentId: "dept-1" });

    expect(res.status).toBe(200);
    expect(mockRecordRemoved).toHaveBeenCalledWith(expect.anything(), "church-1", ["ed-1"], { actorId: createAdminSession().user.id });
    expect(order).toEqual(["record", "delete"]);
  });

  it("série : enregistre les STAR de tous les événements concernés", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ seriesId: null, isRecurrenceParent: true, date: new Date() } as never);
    prismaMock.event.findMany.mockResolvedValue([{ id: "evt-1" }, { id: "evt-2" }] as never);
    prismaMock.eventDepartment.findMany.mockResolvedValue([{ id: "ed-1" }, { id: "ed-2" }] as never);
    prismaMock.planning.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.eventDepartment.deleteMany.mockResolvedValue({ count: 2 });

    const res = await del({ departmentId: "dept-1", applyToSeries: true });

    expect(res.status).toBe(200);
    expect(mockRecordRemoved).toHaveBeenCalledWith(expect.anything(), "church-1", ["ed-1", "ed-2"], expect.any(Object));
  });
});
