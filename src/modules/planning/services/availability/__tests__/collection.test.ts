import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const notifyUsers = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));

const { runAvailabilityTasks } = await import("../collection");

const now = new Date("2026-10-10T10:00:00Z");
const day = 24 * 3600 * 1000;

function notified() {
  return notifyUsers.mock.calls.flatMap(([userIds, n]) =>
    (userIds as string[]).map((userId) => ({ userId, ...(n as { type: string; message: string }) }))
  );
}

function resetEmpty() {
  prismaMock.availabilitySettings.findMany.mockResolvedValue([]);
  prismaMock.church.findMany.mockResolvedValue([{ id: "church-1" }] as never);
  prismaMock.availabilityCollection.findUnique.mockResolvedValue(null);
  prismaMock.availabilityCollection.findMany.mockResolvedValue([]);
  prismaMock.availabilityAsk.findMany.mockResolvedValue([]);
  prismaMock.event.findMany.mockResolvedValue([]);
  prismaMock.event.findFirst.mockResolvedValue(null);
  prismaMock.availabilityReminderLog.findMany.mockResolvedValue([]);
}

describe("runAvailabilityTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmpty();
  });

  it("n'ouvre rien quand aucun événement à venir ne l'exige", async () => {
    const res = await runAvailabilityTasks(now);
    expect(res).toEqual({ opened: 0, openingNotified: 0, asksSent: 0, relances: 0 });
    expect(prismaMock.availabilityCollection.create).not.toHaveBeenCalled();
  });

  it("ouvre les mois cibles (M, M+1, M+2) ayant des événements, closesAt figé à J-7 du premier événement", async () => {
    const first = new Date("2026-11-01T09:00:00Z");
    prismaMock.event.findMany.mockResolvedValue([
      { id: "evt-1", title: "Culte", date: first, eventDepts: [{ departmentId: "dept-1" }] },
    ] as never);
    prismaMock.event.findFirst.mockResolvedValue({ date: first } as never);

    const res = await runAvailabilityTasks(now);

    expect(res.opened).toBe(3);
    const created = prismaMock.availabilityCollection.create.mock.calls.map((c) => (c[0] as { data: { month: Date; closesAt: Date } }).data);
    expect(created[0].closesAt.toISOString()).toBe(new Date(first.getTime() - 7 * day).toISOString());
    expect(created.map((c) => c.month.toISOString())).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
      "2026-12-01T00:00:00.000Z",
    ]);
  });

  it("ouvre même tardivement (clôture déjà passée) et le message demande de répondre au plus vite", async () => {
    const first = new Date("2026-10-12T09:00:00Z");
    // Seul octobre a des événements (tests des mois suivants : liste vide).
    prismaMock.event.findMany.mockImplementation((async (args: { where: { date: { lt: Date } } }) =>
      args.where.date.lt.getTime() <= Date.UTC(2026, 10, 1)
        ? [{ id: "evt-1", title: "Culte", date: first, eventDepts: [{ departmentId: "dept-1" }] }]
        : []) as never);
    prismaMock.event.findFirst.mockResolvedValue({ date: first } as never);
    prismaMock.availabilityCollection.create.mockResolvedValue({} as never);
    prismaMock.availabilityCollection.findMany.mockResolvedValueOnce([
      { id: "c-1", churchId: "church-1", month: new Date("2026-10-01T00:00:00Z"), closesAt: new Date(first.getTime() - 7 * day), openedAt: now },
    ] as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { member: { userLinks: [{ userId: "u-1" }] } },
      { member: { userLinks: [{ userId: "u-1" }] } },
    ] as never);

    const res = await runAvailabilityTasks(now);

    expect(res.opened).toBe(1);
    const rows = notified().filter((n) => n.type === "AVAILABILITY_COLLECTION_OPENED");
    expect(rows).toHaveLength(1); // une seule notification par STAR
    expect(rows[0].message).toMatch(/au plus vite/);
    expect(prismaMock.availabilityCollection.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-1" }, data: { notifiedAt: now } })
    );
  });

  it("église désactivée : aucune ouverture", async () => {
    prismaMock.availabilitySettings.findMany.mockResolvedValue([
      { churchId: "church-1", enabled: false, openMonthsBefore: 2, closeDaysBefore: 7, relanceDaysBefore: 3 },
    ] as never);
    prismaMock.event.findMany.mockResolvedValue([
      { id: "evt-1", title: "Culte", date: new Date("2026-11-01T09:00:00Z"), eventDepts: [{ departmentId: "dept-1" }] },
    ] as never);

    const res = await runAvailabilityTasks(now);
    expect(res.opened).toBe(0);
  });

  it("envoie les demandes ciblées en attente, groupées par STAR, aux seuls sans-réponse", async () => {
    const date = new Date("2026-11-08T10:00:00Z");
    prismaMock.availabilityAsk.findMany.mockResolvedValueOnce([
      { id: "a-1", churchId: "church-1", eventId: "evt-1", departmentId: "dept-1", event: { id: "evt-1", title: "Culte", date, eventDepts: [{ departmentId: "dept-1" }] } },
      { id: "a-2", churchId: "church-1", eventId: "evt-2", departmentId: "dept-1", event: { id: "evt-2", title: "Prière", date, eventDepts: [{ departmentId: "dept-1" }] } },
    ] as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { memberId: "m-1", departmentId: "dept-1", member: { userLinks: [{ userId: "u-1" }] } },
      { memberId: "m-2", departmentId: "dept-1", member: { userLinks: [{ userId: "u-2" }] } },
    ] as never);
    prismaMock.availabilityResponse.findMany.mockResolvedValue([
      { memberId: "m-2", eventId: "evt-1", departmentId: "dept-1" },
      { memberId: "m-2", eventId: "evt-2", departmentId: "dept-1" },
    ] as never);
    prismaMock.absence.findMany.mockResolvedValue([]);

    const res = await runAvailabilityTasks(now);

    expect(res.asksSent).toBe(1);
    const rows = notified().filter((n) => n.type === "AVAILABILITY_ASKED");
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("u-1");
    expect(prismaMock.availabilityAsk.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notifiedAt: now } })
    );
  });

  it("relance une collecte dans sa fenêtre, une fois par STAR et par événement et par jour", async () => {
    const closesAt = new Date(now.getTime() + 2 * day);
    prismaMock.availabilityCollection.findMany
      .mockResolvedValueOnce([]) // notifyOpenings
      .mockResolvedValueOnce([
        { id: "c-1", churchId: "church-1", month: new Date("2026-10-01T00:00:00Z"), closesAt, openedAt: new Date(now.getTime() - 10 * day) },
      ] as never); // relances
    prismaMock.event.findMany.mockResolvedValue([
      { id: "evt-1", title: "Culte", date: new Date(now.getTime() + 5 * day), eventDepts: [{ departmentId: "dept-1" }] },
    ] as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { memberId: "m-1", departmentId: "dept-1", member: { userLinks: [{ userId: "u-1" }] } },
    ] as never);
    prismaMock.availabilityResponse.findMany.mockResolvedValue([]);
    prismaMock.absence.findMany.mockResolvedValue([]);
    prismaMock.availabilityReminderLog.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await runAvailabilityTasks(now);

    expect(res.relances).toBe(1);
    expect(notified().filter((n) => n.type === "AVAILABILITY_RELANCE")).toHaveLength(1);
    expect(prismaMock.availabilityCollection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { relanceSentAt: now } })
    );
  });

  it("n'envoie pas deux fois la même relance le même jour (journal)", async () => {
    const closesAt = new Date(now.getTime() + 2 * day);
    prismaMock.availabilityCollection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "c-1", churchId: "church-1", month: new Date("2026-10-01T00:00:00Z"), closesAt, openedAt: new Date(now.getTime() - 10 * day) },
      ] as never);
    prismaMock.event.findMany.mockResolvedValue([
      { id: "evt-1", title: "Culte", date: new Date(now.getTime() + 5 * day), eventDepts: [{ departmentId: "dept-1" }] },
    ] as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { memberId: "m-1", departmentId: "dept-1", member: { userLinks: [{ userId: "u-1" }] } },
    ] as never);
    prismaMock.availabilityResponse.findMany.mockResolvedValue([]);
    prismaMock.absence.findMany.mockResolvedValue([]);
    prismaMock.availabilityReminderLog.findMany.mockResolvedValue([
      { memberId: "m-1", eventId: "evt-1" },
    ] as never);

    const res = await runAvailabilityTasks(now);
    expect(res.relances).toBe(0);
  });
});
