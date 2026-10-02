import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const notifyUsers = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));

const { askTeam, manualRelance, createAsks } = await import("../asks");

const now = new Date("2026-10-10T10:00:00Z");
const event = { id: "evt-1", title: "Culte", churchId: "church-1", date: new Date("2026-11-08T10:00:00Z") };

function setupTeam() {
  prismaMock.event.findUnique.mockResolvedValue(event as never);
  prismaMock.availabilityCollection.findUnique.mockResolvedValue(null);
  prismaMock.availabilitySettings.findUnique.mockResolvedValue(null);
  prismaMock.memberDepartment.findMany.mockResolvedValue([
    { memberId: "m-1", member: { userLinks: [{ userId: "u-1" }] } },
    { memberId: "m-2", member: { userLinks: [{ userId: "u-2" }] } },
    { memberId: "m-3", member: { userLinks: [] } },
  ] as never);
  prismaMock.availabilityResponse.findMany.mockResolvedValue([{ memberId: "m-2" }] as never);
  prismaMock.availabilityReminderLog.findMany.mockResolvedValue([]);
}

describe("createAsks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne crée rien pour un événement passé", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ churchId: "church-1", date: new Date("2026-10-01") } as never);
    expect(await createAsks(prismaMock as never, { eventId: "evt-1", departmentIds: ["dept-1"], reason: "EVENT_ADDED", now })).toBe(0);
    expect(prismaMock.availabilityAsk.upsert).not.toHaveBeenCalled();
  });

  it("réarme la demande (notifiedAt remis à null) et diffère l'envoi au cron", async () => {
    setupTeam();
    await createAsks(prismaMock as never, { eventId: "evt-1", departmentIds: ["dept-1"], reason: "EVENT_MOVED", now });
    expect(prismaMock.availabilityAsk.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ reason: "EVENT_MOVED", notifiedAt: null, relanceSentAt: null }) })
    );
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});

describe("askTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTeam();
  });

  it("notifie tout de suite les seuls STAR liés à un compte qui n'ont pas répondu", async () => {
    const res = await askTeam({ eventId: "evt-1", departmentId: "dept-1", actorId: "resp-1", now });

    expect(res.notified).toBe(1);
    expect(notifyUsers).toHaveBeenCalledWith(["u-1"], expect.objectContaining({ type: "AVAILABILITY_ASKED", domain: "planning" }));
    expect(prismaMock.availabilityAsk.update).toHaveBeenCalledWith(expect.objectContaining({ data: { notifiedAt: now } }));
  });

  it("400 pour un événement passé", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ ...event, date: new Date("2026-10-01") } as never);
    await expect(askTeam({ eventId: "evt-1", departmentId: "dept-1", actorId: "resp-1", now })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("manualRelance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTeam();
  });

  it("une seule fois par jour, par événement et département (409 sinon)", async () => {
    prismaMock.availabilityAsk.findUnique.mockResolvedValue({ manualRelanceAt: new Date("2026-10-10T07:00:00Z") } as never);
    await expect(manualRelance({ eventId: "evt-1", departmentId: "dept-1", now })).rejects.toMatchObject({ statusCode: 409 });
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("relance les sans-réponse et horodate la relance manuelle", async () => {
    prismaMock.availabilityAsk.findUnique.mockResolvedValue({ manualRelanceAt: new Date("2026-10-09T07:00:00Z") } as never);
    const res = await manualRelance({ eventId: "evt-1", departmentId: "dept-1", now });
    expect(res.notified).toBe(1);
    expect(notifyUsers).toHaveBeenCalledWith(["u-1"], expect.objectContaining({ type: "AVAILABILITY_RELANCE" }));
    expect(prismaMock.availabilityAsk.update).toHaveBeenCalledWith(expect.objectContaining({ data: { manualRelanceAt: now } }));
  });

  it("n'écrit pas deux relances pour le même STAR et événement le même jour (journal)", async () => {
    prismaMock.availabilityAsk.findUnique.mockResolvedValue(null);
    prismaMock.availabilityReminderLog.findMany.mockResolvedValue([{ memberId: "m-1", eventId: "evt-1" }] as never);
    const res = await manualRelance({ eventId: "evt-1", departmentId: "dept-1", now });
    expect(res.notified).toBe(0);
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});
