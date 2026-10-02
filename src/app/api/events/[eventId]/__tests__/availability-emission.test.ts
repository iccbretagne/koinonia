import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: vi.fn(async () => createAdminSession()),
  resolveChurchId: vi.fn(async () => "church-1"),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const emitted: { name: string; payload: unknown }[] = [];
vi.mock("@/modules/planning", () => ({
  deleteEvents: vi.fn(),
  planningBus: { emit: vi.fn(async (name: string, _ctx: unknown, payload: unknown) => void emitted.push({ name, payload })) },
}));

const eventRoute = await import("../route");
const deptRoute = await import("../departments/route");

const eventParams = { params: Promise.resolve({ eventId: "evt-1" }) };

describe("événements — émissions pour la collecte de disponibilités (spec 058)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emitted.length = 0;
  });

  it("PUT : une date modifiée émet planning:event:rescheduled avec ancienne et nouvelle date", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ date: new Date("2026-11-01T10:00:00Z") } as never);
    prismaMock.event.update.mockResolvedValue({ id: "evt-1", date: new Date("2026-11-08T10:00:00Z") } as never);

    const res = await eventRoute.PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({ title: "Culte", type: "CULTE", date: "2026-11-08T10:00:00.000Z" }),
      }),
      eventParams
    );

    expect(res.status).toBe(200);
    expect(emitted).toEqual([
      {
        name: "planning:event:rescheduled",
        payload: {
          eventId: "evt-1",
          churchId: "church-1",
          previousDate: "2026-11-01T10:00:00.000Z",
          newDate: "2026-11-08T10:00:00.000Z",
        },
      },
    ]);
  });

  it("POST département : émet planning:event:departments:added", async () => {
    prismaMock.department.findUnique.mockResolvedValue({ ministry: { churchId: "church-1" } } as never);
    prismaMock.eventDepartment.create.mockResolvedValue({ id: "ed-1", department: { id: "dept-2", name: "Accueil" } } as never);

    const res = await deptRoute.POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ departmentId: "dept-2" }) }),
      eventParams
    );

    expect(res.status).toBe(201);
    expect(emitted).toEqual([
      { name: "planning:event:departments:added", payload: { eventId: "evt-1", churchId: "church-1", departmentIds: ["dept-2"] } },
    ]);
  });

  it("POST département sur une série : émet seulement pour les liens réellement créés", async () => {
    prismaMock.department.findUnique.mockResolvedValue({ ministry: { churchId: "church-1" } } as never);
    prismaMock.event.findUnique.mockResolvedValue({ seriesId: null, isRecurrenceParent: true, date: new Date() } as never);
    prismaMock.event.findMany.mockResolvedValue([{ id: "evt-1" }, { id: "evt-2" }] as never);
    prismaMock.eventDepartment.findUnique
      .mockResolvedValueOnce({ id: "ed-existing" } as never)
      .mockResolvedValueOnce(null);
    prismaMock.eventDepartment.upsert.mockResolvedValue({} as never);

    await deptRoute.POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ departmentId: "dept-2", applyToSeries: true }) }),
      eventParams
    );

    expect(emitted.map((e) => (e.payload as { eventId: string }).eventId)).toEqual(["evt-2"]);
  });
});
