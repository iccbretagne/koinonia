import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const notifyUsers = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));

const { saveResponses } = await import("../responses");

const now = new Date("2026-10-10T10:00:00Z");
const eventDate = new Date("2026-11-08T10:00:00Z");

function setup({ eventDepts = ["dept-1", "dept-2"], memberDepts = ["dept-1", "dept-2"], date = eventDate } = {}) {
  prismaMock.memberDepartment.findMany.mockResolvedValue(memberDepts.map((departmentId) => ({ departmentId })) as never);
  prismaMock.event.findMany.mockResolvedValue([
    { id: "evt-1", title: "Culte", date, eventDepts: eventDepts.map((departmentId) => ({ departmentId })) },
  ] as never);
  prismaMock.availabilityResponse.upsert.mockResolvedValue({} as never);
  prismaMock.planning.findMany.mockResolvedValue([]);
}

describe("saveResponses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("« tous mes départements » est déplié sur les départements du STAR qui servent l'événement", async () => {
    setup({ eventDepts: ["dept-1", "dept-3"], memberDepts: ["dept-1", "dept-2"] });

    const res = await saveResponses({
      memberId: "m-1",
      churchId: "church-1",
      answers: [{ eventId: "evt-1", answer: "AVAILABLE" }],
      actorId: "u-1",
      now,
    });

    expect(res).toEqual({ updated: 1, alerts: 0 });
    expect(prismaMock.availabilityResponse.upsert).toHaveBeenCalledOnce();
    expect(prismaMock.availabilityResponse.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ departmentId: "dept-1", answer: "AVAILABLE", enteredById: "u-1" }) })
    );
  });

  it("une réponse restreinte à un département n'écrit que celui-là", async () => {
    setup();
    await saveResponses({
      memberId: "m-1",
      churchId: "church-1",
      answers: [{ eventId: "evt-1", answer: "IF_NEEDED", departmentIds: ["dept-2"] }],
      actorId: "u-1",
      now,
    });
    expect(prismaMock.availabilityResponse.upsert).toHaveBeenCalledOnce();
    expect(prismaMock.availabilityResponse.upsert.mock.calls[0][0]).toMatchObject({
      where: { memberId_eventId_departmentId: { memberId: "m-1", eventId: "evt-1", departmentId: "dept-2" } },
    });
  });

  it("400 pour un événement passé", async () => {
    setup({ date: new Date("2026-10-01T10:00:00Z") });
    await expect(
      saveResponses({ memberId: "m-1", churchId: "church-1", answers: [{ eventId: "evt-1", answer: "AVAILABLE" }], actorId: "u-1", now })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.availabilityResponse.upsert).not.toHaveBeenCalled();
  });

  it("400 si aucun département du STAR ne sert l'événement", async () => {
    setup({ eventDepts: ["dept-9"] });
    await expect(
      saveResponses({ memberId: "m-1", churchId: "church-1", answers: [{ eventId: "evt-1", answer: "AVAILABLE" }], actorId: "u-1", now })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("400 pour un département qui ne sert pas l'événement", async () => {
    setup({ eventDepts: ["dept-1"] });
    await expect(
      saveResponses({
        memberId: "m-1",
        churchId: "church-1",
        answers: [{ eventId: "evt-1", answer: "AVAILABLE", departmentIds: ["dept-2"] }],
        actorId: "u-1",
        now,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("400 pour un événement d'une autre église (non retourné par la requête)", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([{ departmentId: "dept-1" }] as never);
    prismaMock.event.findMany.mockResolvedValue([]);
    await expect(
      saveResponses({ memberId: "m-1", churchId: "church-1", answers: [{ eventId: "evt-x", answer: "AVAILABLE" }], actorId: "u-1", now })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-1" }) })
    );
  });

  it("STAR déjà planifié devenant indisponible : le responsable est prévenu après validation", async () => {
    setup({ eventDepts: ["dept-1"], memberDepts: ["dept-1"] });
    prismaMock.planning.findMany.mockResolvedValueOnce([{ eventDepartment: { departmentId: "dept-1" } }] as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { departmentId: "dept-1", department: { id: "dept-1", ministryId: "min-1" } },
    ] as never);
    prismaMock.member.findUnique.mockResolvedValue({ firstName: "Jean", lastName: "Dupont" } as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([{ userChurchRole: { userId: "resp-1" } }] as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);

    const res = await saveResponses({
      memberId: "m-1",
      churchId: "church-1",
      answers: [{ eventId: "evt-1", answer: "UNAVAILABLE" }],
      actorId: "u-1",
      now,
    });

    expect(res.alerts).toBe(1);
    expect(notifyUsers).toHaveBeenCalledWith(
      expect.arrayContaining(["resp-1"]),
      expect.objectContaining({ type: "AVAILABILITY_PLANNED_UNAVAILABLE", domain: "planning" })
    );
  });

  it("une réponse « disponible » ne notifie personne", async () => {
    setup({ eventDepts: ["dept-1"], memberDepts: ["dept-1"] });
    await saveResponses({ memberId: "m-1", churchId: "church-1", answers: [{ eventId: "evt-1", answer: "AVAILABLE" }], actorId: "u-1", now });
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});
