import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { logAudit } = await import("@/lib/audit");
const { deleteAppointmentRequest, deleteMsdpFollowUp, countCareItemsFromIntegrationRequest, getAppointmentDeletionInfo } =
  await import("../services/deletion");

const churchId = "church-1";
const actorId = "admin-1";

function order(...mocks: { mock: { invocationCallOrder: number[] } }[]): number[] {
  return mocks.map((m) => m.mock.invocationCallOrder[0]);
}

describe("deleteAppointmentRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.appointmentRequest.deleteMany.mockResolvedValue({ count: 1 } as never);
  });

  it("refuse (409) sans rien supprimer quand un suivi est lié", async () => {
    prismaMock.appointmentRequest.findFirst.mockResolvedValue({ msdpFollowUp: { id: "f-1" } } as never);

    await expect(deleteAppointmentRequest({ id: "r-1", churchId, actorId })).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.agendaEntry.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.notification.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.appointmentRequest.deleteMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("404 si la demande n'existe pas dans cette église", async () => {
    prismaMock.appointmentRequest.findFirst.mockResolvedValue(null);

    await expect(deleteAppointmentRequest({ id: "r-x", churchId, actorId })).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.appointmentRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r-x", churchId } })
    );
  });

  it("supprime agenda, historique, notifications puis la demande, et journalise après", async () => {
    prismaMock.appointmentRequest.findFirst.mockResolvedValue({ msdpFollowUp: null } as never);

    await deleteAppointmentRequest({ id: "r-1", churchId, actorId });

    expect(prismaMock.agendaEntry.deleteMany).toHaveBeenCalledWith({ where: { requestId: "r-1" } });
    expect(prismaMock.auditLog.deleteMany).toHaveBeenCalledWith({
      where: { entityType: "AppointmentRequest", entityId: "r-1" },
    });
    expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ entityType: "AppointmentRequest", entityId: "r-1" }, { link: { in: ["/care/requests/r-1"] } }],
      },
    });
    expect(prismaMock.appointmentRequest.deleteMany).toHaveBeenCalledWith({ where: { id: "r-1", churchId } });

    const [agenda, audit, notif, request, journal] = order(
      prismaMock.agendaEntry.deleteMany,
      prismaMock.auditLog.deleteMany,
      prismaMock.notification.deleteMany,
      prismaMock.appointmentRequest.deleteMany,
      vi.mocked(logAudit)
    );
    expect(agenda).toBeLessThan(audit);
    expect(audit).toBeLessThan(notif);
    expect(notif).toBeLessThan(request);
    expect(request).toBeLessThan(journal);
  });

  it("ligne de journal DELETE sans aucun détail", async () => {
    prismaMock.appointmentRequest.findFirst.mockResolvedValue({ msdpFollowUp: null } as never);

    await deleteAppointmentRequest({ id: "r-1", churchId, actorId });

    expect(logAudit).toHaveBeenCalledWith({
      userId: actorId,
      churchId,
      action: "DELETE",
      entityType: "AppointmentRequest",
      entityId: "r-1",
    });
  });

  it("suppression concurrente : 404 si la ligne a déjà disparu, aucun journal", async () => {
    prismaMock.appointmentRequest.findFirst.mockResolvedValue({ msdpFollowUp: null } as never);
    prismaMock.appointmentRequest.deleteMany.mockResolvedValue({ count: 0 } as never);

    await expect(deleteAppointmentRequest({ id: "r-1", churchId, actorId })).rejects.toMatchObject({ statusCode: 404 });
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("deleteMsdpFollowUp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("supprime historique, notifications et suivi, sans toucher la demande d'origine", async () => {
    prismaMock.msdpFollowUp.deleteMany.mockResolvedValue({ count: 1 } as never);

    await deleteMsdpFollowUp({ id: "f-1", churchId, actorId });

    expect(prismaMock.auditLog.deleteMany).toHaveBeenCalledWith({ where: { entityType: "MsdpFollowUp", entityId: "f-1" } });
    expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ entityType: "MsdpFollowUp", entityId: "f-1" }, { link: { in: ["/care/followups/f-1"] } }] },
    });
    expect(prismaMock.msdpFollowUp.deleteMany).toHaveBeenCalledWith({ where: { id: "f-1", churchId } });
    expect(prismaMock.appointmentRequest.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.familyIntegrationRequest.deleteMany).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "MsdpFollowUp", entityId: "f-1" }));
  });

  it("404 si le suivi n'existe pas dans cette église", async () => {
    prismaMock.msdpFollowUp.deleteMany.mockResolvedValue({ count: 0 } as never);

    await expect(deleteMsdpFollowUp({ id: "f-x", churchId, actorId })).rejects.toMatchObject({ statusCode: 404 });
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("countCareItemsFromIntegrationRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [0, 0, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 2],
  ])("rendez-vous %i + suivi %i = %i", async (appointments, followUps, expected) => {
    prismaMock.appointmentRequest.count.mockResolvedValue(appointments as never);
    prismaMock.msdpFollowUp.count.mockResolvedValue(followUps as never);

    await expect(countCareItemsFromIntegrationRequest(prismaMock as never, "int-1")).resolves.toBe(expected);
    expect(prismaMock.appointmentRequest.count).toHaveBeenCalledWith({ where: { sourceIntegrationRequestId: "int-1" } });
    expect(prismaMock.msdpFollowUp.count).toHaveBeenCalledWith({ where: { requestId: "int-1" } });
  });
});

describe("getAppointmentDeletionInfo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("indique le suivi lié et la présence d'une entrée d'agenda", async () => {
    prismaMock.appointmentRequest.findUnique.mockResolvedValue({
      msdpFollowUp: { id: "f-1" },
      agendaEntry: { id: "a-1" },
    } as never);

    await expect(getAppointmentDeletionInfo("r-1")).resolves.toEqual({ followUpId: "f-1", hasAgendaEntry: true });
  });
});
