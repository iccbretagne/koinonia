import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { checkRoomAvailability, isRoomAuthorizedForChurch, createReservation, cancelReservation, generateRoomRecurrenceDates } =
  await import("@/modules/rooms");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateRoomRecurrenceDates", () => {
  it("génère les occurrences hebdomadaires jusqu'à la date de fin incluse", () => {
    const { dates, truncated } = generateRoomRecurrenceDates(
      new Date("2026-08-02T10:00:00Z"),
      "weekly",
      new Date("2026-08-23T23:59:00Z")
    );
    expect(dates).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it("retourne un tableau vide pour une règle inconnue", () => {
    const { dates } = generateRoomRecurrenceDates(new Date("2026-08-02"), "yearly", new Date("2026-09-02"));
    expect(dates).toEqual([]);
  });
});

describe("checkRoomAvailability", () => {
  it("est disponible si aucune réservation confirmée ne chevauche", async () => {
    prismaMock.roomReservation.findFirst.mockResolvedValue(null);
    const available = await checkRoomAvailability("room-1", new Date("2026-08-01T10:00:00"), new Date("2026-08-01T11:00:00"));
    expect(available).toBe(true);
    expect(prismaMock.roomReservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roomId: "room-1", status: "CONFIRMED" }) })
    );
  });

  it("n'est pas disponible en cas de chevauchement", async () => {
    prismaMock.roomReservation.findFirst.mockResolvedValue({ id: "existing" } as never);
    const available = await checkRoomAvailability("room-1", new Date("2026-08-01T10:00:00"), new Date("2026-08-01T11:00:00"));
    expect(available).toBe(false);
  });
});

describe("isRoomAuthorizedForChurch", () => {
  it("autorise l'église propriétaire", async () => {
    prismaMock.room.findUnique.mockResolvedValue({ churchId: "church-1", sharedWith: [] } as never);
    expect(await isRoomAuthorizedForChurch("room-1", "church-1")).toBe(true);
  });

  it("autorise une église présente dans RoomAccess", async () => {
    prismaMock.room.findUnique.mockResolvedValue({
      churchId: "church-1",
      sharedWith: [{ churchId: "church-2" }],
    } as never);
    expect(await isRoomAuthorizedForChurch("room-1", "church-2")).toBe(true);
  });

  it("refuse une église non partenaire", async () => {
    prismaMock.room.findUnique.mockResolvedValue({ churchId: "church-1", sharedWith: [] } as never);
    expect(await isRoomAuthorizedForChurch("room-1", "church-3")).toBe(false);
  });

  it("refuse si la salle n'existe pas", async () => {
    prismaMock.room.findUnique.mockResolvedValue(null);
    expect(await isRoomAuthorizedForChurch("room-x", "church-1")).toBe(false);
  });
});

describe("createReservation", () => {
  beforeEach(() => {
    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-1",
      isActive: true,
      churchId: "church-1",
      sharedWith: [],
    } as never);
    prismaMock.roomReservation.findFirst.mockResolvedValue(null);
    prismaMock.roomReservation.create.mockImplementation((args: never) =>
      Promise.resolve({ id: `res-${Math.random()}`, ...(args as { data: object }).data })
    );
    prismaMock.roomChecklist.create.mockResolvedValue({} as never);
  });

  it("refuse si l'église n'est pas autorisée sur la salle", async () => {
    prismaMock.room.findUnique.mockResolvedValue({
      id: "room-1",
      isActive: true,
      churchId: "church-1",
      sharedWith: [],
    } as never);

    await expect(
      createReservation({
        churchId: "church-2",
        roomId: "room-1",
        title: "Répétition",
        startAt: new Date("2026-08-01T10:00:00"),
        endAt: new Date("2026-08-01T11:00:00"),
        createdById: "user-1",
      })
    ).rejects.toThrow("autorisée");
  });

  it("crée une occurrence unique quand la salle est libre", async () => {
    const result = await createReservation({
      churchId: "church-1",
      roomId: "room-1",
      title: "Répétition",
      startAt: new Date("2026-08-01T10:00:00"),
      endAt: new Date("2026-08-01T11:00:00"),
      createdById: "user-1",
    });

    expect(result.reservations).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
    expect(prismaMock.roomChecklist.create).toHaveBeenCalledTimes(1);
  });

  it("une occurrence en conflit n'empêche pas la création des autres occurrences de la série", async () => {
    // La 2e occurrence (semaine suivante) est en conflit, les autres sont libres.
    let call = 0;
    prismaMock.roomReservation.findFirst.mockImplementation(() => {
      call += 1;
      return Promise.resolve(call === 2 ? ({ id: "conflict" } as never) : null);
    });

    const result = await createReservation({
      churchId: "church-1",
      roomId: "room-1",
      title: "Culte",
      startAt: new Date("2026-08-02T10:00:00"),
      endAt: new Date("2026-08-02T11:00:00"),
      recurrenceRule: "weekly",
      recurrenceEnd: new Date("2026-08-23T23:59:00"),
      createdById: "user-1",
    });

    expect(result.reservations).toHaveLength(3);
    expect(result.conflicts).toHaveLength(1);
  });

  it("échoue avec 409 quand la seule occurrence demandée est en conflit", async () => {
    prismaMock.roomReservation.findFirst.mockResolvedValue({ id: "conflict" } as never);

    const result = await createReservation({
      churchId: "church-1",
      roomId: "room-1",
      title: "Répétition",
      startAt: new Date("2026-08-01T10:00:00"),
      endAt: new Date("2026-08-01T11:00:00"),
      createdById: "user-1",
    });

    expect(result.reservations).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
  });
});

describe("cancelReservation", () => {
  it("annule uniquement l'occurrence ciblée avec scope 'occurrence'", async () => {
    prismaMock.roomReservation.findUnique.mockResolvedValue({
      id: "res-1",
      churchId: "church-1",
      status: "CONFIRMED",
      isRecurrenceParent: true,
      seriesId: null,
    } as never);
    prismaMock.roomReservation.update.mockResolvedValue({} as never);

    const result = await cancelReservation({ id: "res-1", churchId: "church-1", cancelledById: "user-1", scope: "occurrence" });

    expect(result.cancelledIds).toEqual(["res-1"]);
    expect(prismaMock.roomReservation.updateMany).not.toHaveBeenCalled();
  });

  it("annule toutes les occurrences confirmées et futures de la série avec scope 'series'", async () => {
    prismaMock.roomReservation.findUnique.mockResolvedValue({
      id: "res-parent",
      churchId: "church-1",
      status: "CONFIRMED",
      isRecurrenceParent: true,
      seriesId: null,
    } as never);
    prismaMock.roomReservation.findMany.mockResolvedValue([{ id: "res-parent" }, { id: "res-child-1" }] as never);
    prismaMock.roomReservation.updateMany.mockResolvedValue({ count: 2 } as never);

    const result = await cancelReservation({ id: "res-parent", churchId: "church-1", cancelledById: "user-1", scope: "series" });

    expect(result.cancelledIds.sort()).toEqual(["res-child-1", "res-parent"]);
  });

  it("refuse d'annuler une réservation d'une autre église", async () => {
    prismaMock.roomReservation.findUnique.mockResolvedValue({
      id: "res-1",
      churchId: "church-1",
      status: "CONFIRMED",
      isRecurrenceParent: false,
      seriesId: null,
    } as never);

    await expect(
      cancelReservation({ id: "res-1", churchId: "church-2", cancelledById: "user-1", scope: "occurrence" })
    ).rejects.toThrow();
  });
});
