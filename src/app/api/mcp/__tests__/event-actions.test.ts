/**
 * Tests — événements et salles (spec 081, lot 3c) : droits de l'écran, 1 à 12 dates, heure de
 * Paris, doublons signalés, rien de créé sur une date invalide, salle prise ⇒ refus.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { viewerFor } from "../../assistant/__tests__/viewers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const perms = new Set<string>();
vi.mock("@/lib/auth", () => ({ hasChurchPermission: vi.fn(async (_s: unknown, p: string) => perms.has(p)) }));
const mcp = { createConfirmation: vi.fn(async () => ({ token: "kmx_tok", expiresAt: new Date("2099-01-01T00:05:00Z") })), consumeConfirmation: vi.fn(), publicOrigin: () => "https://koinonia.test" };
vi.mock("@/modules/mcp", () => mcp);
const rooms = { checkRoomAvailability: vi.fn(async (..._a: unknown[]) => true), isRoomAuthorizedForChurch: vi.fn(async (..._a: unknown[]) => true) };
vi.mock("@/modules/rooms", () => rooms);
let created = 0;
const createEvent = vi.fn(async (..._a: unknown[]) => ({ id: `ev${++created}` }));
vi.mock("@/app/api/events/_core", () => ({ createEvent: (...a: unknown[]) => createEvent(...a) }));
const addEventDepartment = vi.fn();
vi.mock("@/app/api/events/[eventId]/departments/_core", () => ({ addEventDepartment: (...a: unknown[]) => addEventDepartment(...a) }));
const reserveRoom = vi.fn();
vi.mock("@/app/api/room-reservations/_core", () => ({ reserveRoom: (...a: unknown[]) => reserveRoom(...a) }));

const e = await import("../_actions/events");
const { parisDateTime } = await import("../_actions/common");
const { ApiError } = await import("@/lib/api-utils");

const ctx = { session: { user: { id: "u1" } } as never, churchId: "c1", viewer: viewerFor("SECRETARY"), grantId: "g1" };
const sundays = ["2099-12-06", "2099-12-13", "2099-12-20", "2099-12-27"].map((day) => ({ day, time: "10:00" }));

beforeEach(() => {
  vi.clearAllMocks();
  perms.clear();
  created = 0;
  prismaMock.department.findMany.mockResolvedValue([{ id: "dL", name: "Louange" }, { id: "dA", name: "Accueil" }]);
  prismaMock.event.findMany.mockResolvedValue([]);
});

describe("heure de Paris", () => {
  it("hiver UTC+1, été UTC+2", () => {
    expect(parisDateTime("2099-12-06", "10:00").toISOString()).toBe("2099-12-06T09:00:00.000Z");
    expect(parisDateTime("2099-07-05", "10:00").toISOString()).toBe("2099-07-05T08:00:00.000Z");
  });
});

describe("créer des événements", () => {
  it("proposé avec events:manage (Secrétaire oui, Resp. département non) ; salles avec rooms:reserve", () => {
    const names = (role: string) => e.EVENT_ACTIONS.filter((a) => a.available(viewerFor(role))).map((a) => a.name);
    expect(names("SECRETARY")).toContain("create_events_confirm");
    expect(names("DEPARTMENT_HEAD")).not.toContain("create_events_confirm");
    expect(names("DEPARTMENT_HEAD")).toContain("reserve_room_confirm");
    expect(names("STAR")).toEqual([]);
  });

  it("aperçu : dates, départements, doublon signalé ; rien de créé", async () => {
    perms.add("events:manage");
    prismaMock.event.findMany.mockResolvedValue([{ title: "Culte ", date: new Date("2099-12-13T09:00:00Z") }]);
    const out = await e.previewCreateEvents({ title: "Culte", type: "CULTE", occurrences: sundays, departments: ["louange", "Accueil"], planningDeadline: "48h" }, ctx);
    expect(out.text).toContain("4 événement(s) « Culte » (Culte)");
    expect(out.text).toContain("dim. 13 déc. 10:00 ⚠ un événement de même titre existe déjà");
    expect(out.text).toContain("Départements en service : Louange, Accueil.");
    expect(createEvent).not.toHaveBeenCalled();
    const payload = (mcp.createConfirmation.mock.calls[0] as unknown[])[2] as { dates: string[]; departmentIds: string[] };
    expect(payload.dates[0]).toBe("2099-12-06T09:00:00.000Z");
    expect(payload.departmentIds).toEqual(["dL", "dA"]);
  });

  it("refus : sans events:manage, date passée, doublon de date, département inconnu, plus de 12 dates", async () => {
    const input = { title: "Culte", type: "CULTE" as const, occurrences: sundays };
    expect((await e.previewCreateEvents(input, ctx)).text).toContain("pas ce droit");
    perms.add("events:manage");
    expect((await e.previewCreateEvents({ ...input, occurrences: [{ day: "2020-01-05", time: "10:00" }] }, ctx)).text).toContain("déjà passée");
    expect((await e.previewCreateEvents({ ...input, occurrences: [sundays[0], sundays[0]] }, ctx)).text).toContain("deux fois");
    expect((await e.previewCreateEvents({ ...input, departments: ["Fanfare"] }, ctx)).text).toContain("Département inconnu");
    const thirteen = Array.from({ length: 13 }, (_, i) => ({ day: `2099-01-${String(i + 1).padStart(2, "0")}`, time: "10:00" }));
    expect(e.createEventsInput.safeParse({ ...input, occurrences: thirteen }).success).toBe(false);
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("confirmation : code de l'écran pour chaque date et chaque département, journalisé via mcp", async () => {
    perms.add("events:manage");
    mcp.consumeConfirmation.mockResolvedValue({ title: "Culte", type: "CULTE", dates: ["2099-12-06T09:00:00.000Z", "2099-12-13T09:00:00.000Z"], departmentIds: ["dL"], deadlineOffset: "48h" });
    const out = await e.confirmCreateEvents({ confirmation: "kmx_tok" }, ctx);
    expect(createEvent).toHaveBeenCalledTimes(2);
    expect(createEvent).toHaveBeenCalledWith(ctx.session, expect.objectContaining({ churchId: "c1", date: "2099-12-06T09:00:00.000Z", deadlineOffset: "48h" }), { via: "mcp" });
    expect(addEventDepartment).toHaveBeenCalledWith(ctx.session, "c1", "ev1", "dL");
    expect(out.structured).toMatchObject({ done: true, eventIds: ["ev1", "ev2"] });
  });

  it("confirmation : droit perdu ou date passée entre-temps ⇒ rien de créé", async () => {
    mcp.consumeConfirmation.mockResolvedValue({ title: "Culte", type: "CULTE", dates: ["2099-12-06T09:00:00.000Z"], departmentIds: [], deadlineOffset: null });
    expect((await e.confirmCreateEvents({ confirmation: "kmx_tok" }, ctx)).text).toContain("pas ce droit");
    perms.add("events:manage");
    mcp.consumeConfirmation.mockResolvedValue({ title: "Culte", type: "CULTE", dates: ["2020-12-06T09:00:00.000Z"], departmentIds: [], deadlineOffset: null });
    expect((await e.confirmCreateEvents({ confirmation: "kmx_tok" }, ctx)).text).toContain("passée");
    expect(createEvent).not.toHaveBeenCalled();
  });
});

describe("salles", () => {
  it("salles libres : seulement celles disponibles sur le créneau", async () => {
    perms.add("rooms:reserve");
    prismaMock.room.findMany.mockResolvedValue([{ id: "r1", name: "Salle A", capacity: 30 }, { id: "r2", name: "Salle B", capacity: null }]);
    rooms.checkRoomAvailability.mockImplementation(async (...a: unknown[]) => a[0] === "r1");
    const out = await e.roomsAvailable({ day: "2099-12-10", start: "19:00", end: "21:00" }, ctx);
    expect(out.text).toContain("Salle A (30 places) [roomId r1]");
    expect(out.text).not.toContain("Salle B");
  });

  it("réservation : salle non ouverte à l'église ou prise ⇒ refus ; prise entre-temps à la confirmation ⇒ message de l'écran", async () => {
    perms.add("rooms:reserve");
    const input = { roomId: "r1", title: "Répétition", day: "2099-12-10", start: "19:00", end: "21:00" };
    rooms.isRoomAuthorizedForChurch.mockResolvedValueOnce(false);
    expect((await e.previewReserve(input, ctx)).text).toContain("pas ouverte");
    rooms.checkRoomAvailability.mockResolvedValueOnce(false);
    expect((await e.previewReserve(input, ctx)).text).toContain("déjà réservée");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();

    rooms.checkRoomAvailability.mockResolvedValue(true);
    prismaMock.room.findUnique.mockResolvedValue({ name: "Salle A" });
    expect((await e.previewReserve(input, ctx)).text).toContain("Réservation de Salle A le");
    const payload = (mcp.createConfirmation.mock.calls[0] as unknown[])[2];
    mcp.consumeConfirmation.mockResolvedValue(payload);
    reserveRoom.mockRejectedValueOnce(new ApiError(409, "Salle déjà réservée sur ce créneau"));
    expect((await e.confirmReserve({ confirmation: "kmx_tok" }, ctx)).text).toBe("Salle déjà réservée sur ce créneau");
    await e.confirmReserve({ confirmation: "kmx_tok" }, ctx);
    expect(reserveRoom).toHaveBeenLastCalledWith(ctx.session, expect.objectContaining({ churchId: "c1", roomId: "r1", title: "Répétition" }), { via: "mcp" });
  });
});
