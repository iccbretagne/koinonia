import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({ default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }) }));
const notifyInterviewBooked = vi.fn();
const notifyInterviewCancelled = vi.fn();
const emailSlotsInvitation = vi.fn();
vi.mock("../notifications", () => ({
  notifyInterviewBooked: (...a: unknown[]) => notifyInterviewBooked(...a),
  notifyInterviewCancelled: (...a: unknown[]) => notifyInterviewCancelled(...a),
  emailSlotsInvitation: (...a: unknown[]) => emailSlotsInvitation(...a),
  emailInterviewLink: vi.fn(),
}));
vi.mock("../tokens", () => ({ ensureManageToken: vi.fn(), tokenOf: () => "tok" }));

const { bookSlot, cancelInterview, declineSlots, displayStatus, hasRepeatedNoShow, inviteToBook, recordOutcome } = await import("../interviews");

const NOW = new Date("2026-11-15T10:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000);
const slot = (id: string, startsAt = hours(72)) => ({ id, churchId: "church-1", startsAt, durationMinutes: 30, location: "Salle 2", visioUrl: null, interviewerId: "u-pvs", bookedAt: null });
const interview = (over: Record<string, unknown> = {}) => ({ id: "i1", applicationId: "app-1", slotId: "s1", status: "BOOKED", startsAt: hours(72), durationMinutes: 30, location: "Salle 2", visioUrl: null, interviewerId: "u-pvs", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.servingApplication.findUniqueOrThrow.mockResolvedValue({ id: "app-1", churchId: "church-1", status: "RECEIVED", firstName: "Marie", lastName: "K", email: "m@x.fr", manageSalt: "s" });
  prismaMock.servingInterviewSlot.findUnique.mockResolvedValue(slot("s2"));
  prismaMock.servingInterviewSlot.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.servingInterview.findFirst.mockResolvedValue(null);
  prismaMock.servingInterview.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "new", status: "BOOKED", ...data }));
  prismaMock.servingInterview.update.mockImplementation(async ({ data }: { data: object }) => ({ ...interview(), ...data }));
  prismaMock.servingApplication.update.mockResolvedValue({});
});

describe("bookSlot", () => {
  it("prend le créneau par une mise à jour conditionnelle et lève le repère « À planifier »", async () => {
    await bookSlot("app-1", "s2", { byCandidate: true, now: NOW });
    expect(prismaMock.servingInterviewSlot.updateMany).toHaveBeenCalledWith({ where: { id: "s2", bookedAt: null, startsAt: { gt: NOW } }, data: { bookedAt: NOW } });
    expect(prismaMock.servingApplication.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ schedulingReason: null }) }));
    expect(notifyInterviewBooked).toHaveBeenCalledOnce();
  });

  it("deux réservations simultanées : la seconde est refusée (409)", async () => {
    prismaMock.servingInterviewSlot.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const results = await Promise.allSettled([bookSlot("app-1", "s2", { byCandidate: true, now: NOW }), bookSlot("app-2", "s2", { byCandidate: true, now: NOW })]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    expect(prismaMock.servingInterview.create).toHaveBeenCalledOnce();
  });

  it("changer de créneau annule l'ancien rendez-vous et libère son créneau", async () => {
    prismaMock.servingInterview.findFirst.mockResolvedValue(interview());
    await bookSlot("app-1", "s2", { byCandidate: true, now: NOW });
    expect(prismaMock.servingInterview.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "CANCELLED", cancelReason: "CANDIDATE" } });
    expect(prismaMock.servingInterviewSlot.updateMany).toHaveBeenCalledWith({ where: { id: "s1" }, data: { bookedAt: null } });
  });

  it("le candidat ne change plus à moins de 24 h ; le PVS le peut", async () => {
    prismaMock.servingInterview.findFirst.mockResolvedValue(interview({ startsAt: hours(20) }));
    await expect(bookSlot("app-1", "s2", { byCandidate: true, now: NOW })).rejects.toThrow(/24 heures/);
    await expect(bookSlot("app-1", "s2", { byCandidate: false, now: NOW })).resolves.toBeTruthy();
  });

  it("refuse un créneau d'une autre église ou une candidature non retenue", async () => {
    prismaMock.servingInterviewSlot.findUnique.mockResolvedValueOnce({ ...slot("s2"), churchId: "church-2" });
    await expect(bookSlot("app-1", "s2", { byCandidate: true, now: NOW })).rejects.toThrow(/introuvable/);
    prismaMock.servingApplication.findUniqueOrThrow.mockResolvedValueOnce({ churchId: "church-1", status: "REJECTED" });
    await expect(bookSlot("app-1", "s2", { byCandidate: true, now: NOW })).rejects.toThrow(/plus à l'étude/);
  });
});

describe("cancelInterview / declineSlots", () => {
  it("annulation par le candidat : créneau libéré, « À planifier · annulé par le candidat »", async () => {
    prismaMock.servingInterview.findFirst.mockResolvedValue(interview());
    await cancelInterview("app-1", "CANDIDATE", { now: NOW });
    expect(prismaMock.servingInterviewSlot.updateMany).toHaveBeenCalledWith({ where: { id: "s1" }, data: { bookedAt: null } });
    expect(prismaMock.servingApplication.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ schedulingReason: "CANDIDATE_CANCELLED" }) }));
    expect(notifyInterviewCancelled).toHaveBeenCalledWith(expect.anything(), expect.anything(), "CANDIDATE");
  });

  it("non-retenue : pas de repère « À planifier »", async () => {
    prismaMock.servingInterview.findFirst.mockResolvedValue(interview());
    await cancelInterview("app-1", "REJECTED", { now: NOW });
    expect(prismaMock.servingApplication.update).not.toHaveBeenCalled();
  });

  it("le candidat n'annule plus à moins de 24 h", async () => {
    prismaMock.servingInterview.findFirst.mockResolvedValue(interview({ startsAt: hours(5) }));
    await expect(cancelInterview("app-1", "CANDIDATE", { now: NOW })).rejects.toThrow(/24 heures/);
  });

  it("« aucun créneau ne me convient » : refusé si un rendez-vous est réservé", async () => {
    await declineSlots("app-1", NOW);
    expect(prismaMock.servingApplication.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ schedulingReason: "DECLINED" }) }));
    prismaMock.servingInterview.findFirst.mockResolvedValue(interview());
    await expect(declineSlots("app-1", NOW)).rejects.toThrow(/déjà réservé/);
  });
});

describe("issue et statuts calculés", () => {
  it("« À compléter » une fois la fin passée", () => {
    expect(displayStatus({ status: "BOOKED", startsAt: hours(-1), durationMinutes: 30 }, NOW)).toBe("TO_COMPLETE");
    expect(displayStatus({ status: "BOOKED", startsAt: hours(1), durationMinutes: 30 }, NOW)).toBe("BOOKED");
  });

  it("absent : à reprogrammer ; réalisé : repère levé", async () => {
    prismaMock.servingInterview.findFirst.mockResolvedValue(interview({ startsAt: hours(-2) }));
    await recordOutcome("app-1", "NO_SHOW", "u-pvs", NOW);
    expect(prismaMock.servingApplication.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ schedulingReason: "NO_SHOW" }) }));
    await recordOutcome("app-1", "DONE", "u-pvs", NOW);
    expect(prismaMock.servingApplication.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ schedulingReason: null }) }));
  });

  it("aucune issue avant l'heure", async () => {
    await expect(recordOutcome("app-1", "DONE", "u-pvs", NOW)).rejects.toThrow(/Aucun entretien passé/);
  });

  it("deux absences d'affilée, annulations ignorées", () => {
    const at = (h: number, status: string) => ({ status: status as "NO_SHOW", startsAt: hours(h) });
    expect(hasRepeatedNoShow([at(-10, "NO_SHOW"), at(-5, "CANCELLED"), at(-1, "NO_SHOW")])).toBe(true);
    expect(hasRepeatedNoShow([at(-10, "NO_SHOW"), at(-5, "EXCUSED"), at(-1, "NO_SHOW")])).toBe(false);
  });

  it("invitation : refusée sans email", async () => {
    prismaMock.servingApplication.findUniqueOrThrow.mockResolvedValue({ id: "app-1", churchId: "church-1", firstName: "M", lastName: "K", email: null, manageSalt: "s" });
    await expect(inviteToBook("app-1", NOW)).rejects.toThrow(/Pas d'email/);
    expect(emailSlotsInvitation).not.toHaveBeenCalled();
  });
});
