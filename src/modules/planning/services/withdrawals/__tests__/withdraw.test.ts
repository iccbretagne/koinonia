import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
const notifyUsers = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));
const listReplacementCandidates = vi.fn();
vi.mock("../candidates", () => ({ listReplacementCandidates: (...a: unknown[]) => listReplacementCandidates(...a) }));
const resolveWithdrawalRecipients = vi.fn();
vi.mock("../recipients", () => ({ resolveWithdrawalRecipients: (...a: unknown[]) => resolveWithdrawalRecipients(...a) }));

const { createWithdrawal, withdrawService } = await import("../withdraw");

const now = new Date("2026-11-04T10:00:00Z");
const input = { churchId: "church-1", eventId: "evt-1", departmentId: "dept-1", memberId: "paul", actorId: "u-paul", message: "fièvre" };

function setup({ status = "EN_SERVICE" as string | null, deadline = "2026-11-05T20:00:00Z" as string | null, pending = false } = {}) {
  prismaMock.event.findFirst.mockResolvedValue({
    date: new Date("2026-11-08T10:00:00Z"),
    planningDeadline: deadline ? new Date(deadline) : null,
  } as never);
  prismaMock.planning.findFirst.mockResolvedValue(status === undefined ? null : ({ id: "p-1", status } as never));
  prismaMock.serviceWithdrawal.findFirst.mockResolvedValue(pending ? ({ id: "w-old" } as never) : null);
  prismaMock.serviceWithdrawal.create.mockResolvedValue({ id: "w-1" } as never);
}

describe("createWithdrawal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retire le STAR du planning en gardant son statut d'origine, passe sa réponse à « Pas disponible » et supprime la notice 060", async () => {
    setup({ status: "EN_SERVICE_DEBRIEF" });
    expect(await createWithdrawal(input, prismaMock as never, now)).toBe("w-1");

    expect(prismaMock.serviceWithdrawal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ memberId: "paul", originalStatus: "EN_SERVICE_DEBRIEF", message: "fièvre", createdById: "u-paul" }),
      })
    );
    expect(prismaMock.planning.update).toHaveBeenCalledWith({ where: { id: "p-1" }, data: { status: null } });
    expect(prismaMock.availabilityResponse.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { answer: "UNAVAILABLE", enteredById: "u-paul" } })
    );
    expect(prismaMock.planningChangeNotice.deleteMany).toHaveBeenCalledWith({
      where: { memberId: "paul", eventId: "evt-1", departmentId: "dept-1" },
    });
  });

  it("un service « remplaçant » se quitte comme les autres", async () => {
    setup({ status: "REMPLACANT" });
    await createWithdrawal(input, prismaMock as never, now);
    expect(prismaMock.serviceWithdrawal.create.mock.calls[0][0].data.originalStatus).toBe("REMPLACANT");
  });

  it("400 si le STAR n'est pas planifié sur ce service", async () => {
    setup({ status: null });
    await expect(createWithdrawal(input, prismaMock as never, now)).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.serviceWithdrawal.create).not.toHaveBeenCalled();
  });

  it("409 si un désistement est déjà en attente", async () => {
    setup({ pending: true });
    await expect(createWithdrawal(input, prismaMock as never, now)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("400 « contacte ton responsable » une fois la date limite passée", async () => {
    setup({ deadline: "2026-11-03T20:00:00Z" });
    await expect(createWithdrawal(input, prismaMock as never, now)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("contacte ton responsable"),
    });
    expect(prismaMock.planning.update).not.toHaveBeenCalled();
  });

  it("404 pour un événement d'une autre église", async () => {
    setup();
    prismaMock.event.findFirst.mockResolvedValue(null);
    await expect(createWithdrawal(input, prismaMock as never, now)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("withdrawService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("journalise puis notifie les responsables après la transaction, avec le nombre de candidats et le message", async () => {
    setup();
    prismaMock.serviceWithdrawal.findUnique.mockResolvedValue({
      id: "w-1",
      churchId: "church-1",
      departmentId: "dept-1",
      memberId: "paul",
      message: "fièvre",
      event: { id: "evt-1", date: new Date("2026-11-08T10:00:00Z") },
      department: { name: "Choristes" },
      member: { firstName: "Paul", lastName: "Martin" },
    } as never);
    prismaMock.memberUserLink.findMany.mockResolvedValue([{ userId: "u-paul" }] as never);
    resolveWithdrawalRecipients.mockResolvedValue(["marie"]);
    listReplacementCandidates.mockResolvedValue([{}, {}, {}]);

    expect(await withdrawService(input, now)).toEqual({ id: "w-1" });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityType: "ServiceWithdrawal", entityId: "w-1" }));
    expect(notifyUsers).toHaveBeenCalledWith(["marie"], {
      domain: "planning",
      type: "SERVICE_WITHDRAWAL",
      title: "Service à remplacer",
      message: expect.stringMatching(/^Paul Martin ne peut plus servir le .+ \(Choristes\) — 3 remplaçants possibles\. Son message : « fièvre »$/),
      link: "/planning/remplacements/w-1",
      entityType: "ServiceWithdrawal",
      entityId: "w-1",
    });
    // La notification part après la transaction.
    expect(notifyUsers.mock.invocationCallOrder[0]).toBeGreaterThan(prismaMock.$transaction.mock.invocationCallOrder[0]);
  });

  it("annonce clairement l'absence de remplaçant possible", async () => {
    setup();
    prismaMock.serviceWithdrawal.findUnique.mockResolvedValue({
      id: "w-1",
      churchId: "church-1",
      departmentId: "dept-1",
      memberId: "paul",
      message: null,
      event: { id: "evt-1", date: new Date("2026-11-08T10:00:00Z") },
      department: { name: "Choristes" },
      member: { firstName: "Paul", lastName: "Martin" },
    } as never);
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);
    resolveWithdrawalRecipients.mockResolvedValue(["marie"]);
    listReplacementCandidates.mockResolvedValue([]);

    await withdrawService(input, now);
    expect(notifyUsers.mock.calls[0][1].message).toContain("aucun membre disponible ni « si besoin » libre ce jour-là");
  });
});
