import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({ default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }) }));
vi.mock("../../auth", () => ({ getPvsDepartmentIds: vi.fn().mockResolvedValue(["dept-pvs"]) }));
const notifyInterviewMoved = vi.fn();
const notifyInterviewCancelled = vi.fn();
vi.mock("../notifications", () => ({
  pvsRecipientIds: vi.fn().mockResolvedValue(["u-pvs", "u-pvs2"]),
  notifyInterviewMoved: (...a: unknown[]) => notifyInterviewMoved(...a),
  notifyInterviewCancelled: (...a: unknown[]) => notifyInterviewCancelled(...a),
  notifyInterviewBooked: vi.fn(),
  emailInterviewLink: vi.fn(),
  emailSlotsInvitation: vi.fn(),
}));
vi.mock("../tokens", () => ({ ensureManageToken: vi.fn(), tokenOf: () => "tok" }));

const { createSlots, deleteSlot, expandSeries, listFreeSlots, listSlots, updateSlot } = await import("../slots");

const NOW = new Date("2026-11-15T10:00:00Z");
const base = { durationMinutes: 30, interviewerId: "u-pvs", location: "Salle 2", visioUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findMany.mockResolvedValue([
    { id: "u-pvs", name: "Awa Traoré", displayName: null, email: "a@x.fr" },
    { id: "u-pvs2", name: "Paul N.", displayName: null, email: "p@x.fr" },
  ]);
  prismaMock.servingInterviewSlot.findMany.mockResolvedValue([]);
  prismaMock.servingInterviewSlot.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  prismaMock.servingSettings.upsert.mockResolvedValue({});
});

describe("expandSeries", () => {
  it("découpe la plage par pas de la durée, dernier créneau fini avant la fin", () => {
    const slots = expandSeries({ ...base, days: ["2026-11-21", "2026-11-20"], from: "09:00", to: "10:45" });
    expect(slots.map((s) => `${s.day} ${s.time}`)).toEqual([
      "2026-11-20 09:00",
      "2026-11-20 09:30",
      "2026-11-20 10:00",
      "2026-11-21 09:00",
      "2026-11-21 09:30",
      "2026-11-21 10:00",
    ]);
  });
  it("refuse une plage vide ou inversée", () => {
    expect(() => expandSeries({ ...base, days: ["2026-11-20"], from: "10:00", to: "09:00" })).toThrow();
    expect(() => expandSeries({ ...base, days: ["2026-11-20"], from: "10:00", to: "10:15" })).toThrow();
  });
});

describe("createSlots", () => {
  it("crée une série à l'heure de Paris et ouvre une vague d'invitation", async () => {
    const n = await createSlots("church-1", { series: { ...base, days: ["2026-11-20"], from: "18:00", to: "19:00" } }, "u-pvs", NOW);
    expect(n).toBe(2);
    const { data } = prismaMock.servingInterviewSlot.createMany.mock.calls[0][0];
    expect(data[0].startsAt.toISOString()).toBe("2026-11-20T17:00:00.000Z");
    expect(data[0].seriesId).toBe(data[1].seriesId);
    expect(prismaMock.servingSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { slotsOpenedAt: NOW } }));
  });
  it("refuse une personne hors de l'équipe PVS", async () => {
    await expect(createSlots("church-1", { slots: [{ ...base, interviewerId: "u-autre", day: "2026-11-20", time: "18:00" }] }, "u", NOW)).rejects.toThrow(/équipe Vie des STAR/);
  });
  it("refuse un créneau passé, et lieu + visio ensemble", async () => {
    await expect(createSlots("church-1", { slots: [{ ...base, day: "2026-11-14", time: "18:00" }] }, "u", NOW)).rejects.toThrow(/passé/);
    await expect(
      createSlots("church-1", { slots: [{ ...base, visioUrl: "https://visio.example/x", day: "2026-11-20", time: "18:00" }] }, "u", NOW)
    ).rejects.toThrow(/pas les deux/);
  });
  it("refuse deux créneaux qui se chevauchent pour la même personne", async () => {
    await expect(
      createSlots("church-1", { slots: [{ ...base, day: "2026-11-20", time: "18:00" }, { ...base, day: "2026-11-20", time: "18:15" }] }, "u", NOW)
    ).rejects.toThrow(/chevauchent/);
    prismaMock.servingInterviewSlot.findMany.mockResolvedValueOnce([{ startsAt: new Date("2026-11-20T16:50:00Z"), durationMinutes: 30 }]);
    await expect(createSlots("church-1", { slots: [{ ...base, day: "2026-11-20", time: "18:00" }] }, "u", NOW)).rejects.toThrow(/déjà un créneau/);
  });
});

describe("updateSlot / deleteSlot", () => {
  const slot = { id: "s1", churchId: "church-1", startsAt: new Date("2026-11-20T17:00:00Z"), durationMinutes: 30, location: "Salle 2", visioUrl: null, interviewerId: "u-pvs" };

  it("le rendez-vous réservé suit le créneau et le candidat est prévenu", async () => {
    prismaMock.servingInterviewSlot.findUniqueOrThrow.mockResolvedValue(slot);
    const booked = { ...slot, id: "i1", applicationId: "app-1", slotId: "s1" };
    prismaMock.servingInterview.findFirst.mockResolvedValue(booked);
    prismaMock.servingInterview.update.mockImplementation(async ({ data }: { data: object }) => ({ ...booked, ...data }));
    prismaMock.servingApplication.findUniqueOrThrow.mockResolvedValue({ id: "app-1", churchId: "church-1", firstName: "Marie", lastName: "K", email: null, manageSalt: "s" });
    await updateSlot("s1", { time: "19:00" }, NOW);
    expect(prismaMock.servingInterview.update.mock.calls[0][0].data.startsAt.toISOString()).toBe("2026-11-20T18:00:00.000Z");
    expect(notifyInterviewMoved).toHaveBeenCalledOnce();
  });

  it("un créneau passé ne se modifie plus", async () => {
    prismaMock.servingInterviewSlot.findUniqueOrThrow.mockResolvedValue({ ...slot, startsAt: new Date("2026-11-14T10:00:00Z") });
    await expect(updateSlot("s1", { time: "19:00" }, NOW)).rejects.toThrow(/passé/);
  });

  it("retirer un créneau réservé annule le rendez-vous (SLOT_REMOVED)", async () => {
    prismaMock.servingInterview.findFirst.mockResolvedValue({ id: "i1", applicationId: "app-1", slotId: "s1", status: "BOOKED", startsAt: slot.startsAt, durationMinutes: 30 });
    prismaMock.servingInterview.update.mockResolvedValue({ ...slot, id: "i1" });
    prismaMock.servingApplication.findUniqueOrThrow.mockResolvedValue({ id: "app-1", churchId: "church-1", firstName: "Marie", lastName: "K", email: "m@x.fr", manageSalt: "s" });
    await deleteSlot("s1", NOW);
    expect(prismaMock.servingInterview.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "CANCELLED", cancelReason: "SLOT_REMOVED" } }));
    expect(notifyInterviewCancelled).toHaveBeenCalledWith(expect.anything(), expect.anything(), "SLOT_REMOVED");
    expect(prismaMock.servingInterviewSlot.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });
});

describe("listSlots / listFreeSlots", () => {
  it("signale « à réattribuer » et ne propose pas ces créneaux au candidat", async () => {
    const rows = [
      { id: "s1", startsAt: new Date("2026-11-20T17:00:00Z"), durationMinutes: 30, location: null, visioUrl: "https://v", seriesId: null, interviewerId: "u-pvs", interviewer: { id: "u-pvs", name: "Awa", displayName: null, email: "a" }, interviews: [] },
      { id: "s2", startsAt: new Date("2026-11-20T18:00:00Z"), durationMinutes: 30, location: null, visioUrl: null, seriesId: null, interviewerId: "u-parti", interviewer: { id: "u-parti", name: "X", displayName: null, email: "x" }, interviews: [] },
    ];
    prismaMock.servingInterviewSlot.findMany.mockResolvedValue(rows);
    const all = await listSlots("church-1", {}, NOW);
    expect(all.map((s) => s.toReassign)).toEqual([false, true]);
    const free = await listFreeSlots("church-1", NOW);
    expect(free.map((s) => s.id)).toEqual(["s1"]);
    expect(free[0].visioUrl).toBe(true); // le lien de visio n'est donné qu'au candidat qui a réservé
  });
});
