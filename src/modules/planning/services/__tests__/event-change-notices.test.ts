import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const createNotification = vi.fn();
vi.mock("@/lib/notifications", () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));

const { collectEventChangeNotices, sendEventChangeNotices } = await import("../event-change-notices");

type Tx = Parameters<typeof collectEventChangeNotices>[0];
const tx = prismaMock as unknown as Tx;

const now = new Date("2026-11-01T08:00:00Z");
const evtDate = new Date("2026-11-08T09:00:00Z");
const later = new Date("2026-11-08T09:30:00Z");

const louange = { name: "Louange", ministryId: "min-A" };
const accueil = { name: "Accueil", ministryId: "min-B" };

function planned(eventId: string, departmentId: string, department: { name: string; ministryId: string }, userIds: string[]) {
  return {
    eventDepartment: { eventId, departmentId, department },
    member: { userLinks: userIds.map((userId) => ({ userId })) },
  };
}

function setup({
  events = [{ id: "evt-1", title: "Culte", date: evtDate }],
  plannings = [planned("evt-1", "dept-L", louange, ["u-star"]), planned("evt-1", "dept-A", accueil, [])],
  heads = [{ departmentId: "dept-L", userChurchRole: { userId: "u-head" } }],
  ministers = [{ userId: "u-min", ministryId: "min-B" }],
}: {
  events?: { id: string; title: string; date: Date }[];
  plannings?: ReturnType<typeof planned>[];
  heads?: { departmentId: string; userChurchRole: { userId: string } }[];
  ministers?: { userId: string; ministryId: string }[];
} = {}) {
  prismaMock.event.findMany.mockResolvedValue(events as never);
  prismaMock.planning.findMany.mockResolvedValue(plannings as never);
  prismaMock.userDepartment.findMany.mockResolvedValue(heads as never);
  prismaMock.userChurchRole.findMany.mockResolvedValue(ministers as never);
}

const moved = (eventId = "evt-1", previousDate = evtDate, newDate = later) =>
  ({ kind: "MOVED" as const, eventId, previousDate, newDate });

function byUser<T extends { userId: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((i) => [i.userId, i]));
}

describe("collectEventChangeNotices (spec 059)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it("déplacement : prévient le STAR planifié avec l'ancien et le nouvel horaire", async () => {
    const { items } = await collectEventChangeNotices(tx, "church-1", [moved()], { actorId: "u-admin", now });
    const star = byUser(items)["u-star"];
    expect(star).toMatchObject({ type: "EVENT_RESCHEDULED", title: "Événement déplacé : Culte", link: "/planning" });
    expect(star.message).toMatch(/→/);
    expect(star.message).toMatch(/toujours planifié/);
  });

  it("ne lit que les plannings EN_SERVICE / EN_SERVICE_DEBRIEF / REMPLACANT de l'église", async () => {
    await collectEventChangeNotices(tx, "church-1", [moved()], { now });
    const where = prismaMock.planning.findMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.status).toEqual({ in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"] });
    expect(where.eventDepartment).toMatchObject({ event: { churchId: "church-1" } });
    expect(prismaMock.event.findMany.mock.calls[0][0]!.where).toMatchObject({ churchId: "church-1" });
    expect(prismaMock.userDepartment.findMany.mock.calls[0][0]!.where).toMatchObject({
      userChurchRole: { churchId: "church-1", role: "DEPARTMENT_HEAD" },
    });
    expect(prismaMock.userChurchRole.findMany.mock.calls[0][0]!.where).toMatchObject({ churchId: "church-1", role: "MINISTER" });
  });

  it("responsable et Ministre reçoivent le récapitulatif de leurs départements, lien grille", async () => {
    const { items } = await collectEventChangeNotices(tx, "church-1", [moved()], { now });
    const users = byUser(items);
    expect(users["u-head"].message).toContain("Personnes concernées : Louange (1).");
    expect(users["u-head"].link).toBe("/dashboard");
    // STAR de l'Accueil sans compte : compté chez le Ministre, ne reçoit rien lui-même.
    expect(users["u-min"].message).toContain("Accueil (1)");
    expect(items).toHaveLength(3);
  });

  it("un encadrant lui-même planifié ne reçoit qu'une notification, qui le mentionne", async () => {
    setup({ plannings: [planned("evt-1", "dept-L", louange, ["u-head"])] });
    const { items } = await collectEventChangeNotices(tx, "church-1", [moved()], { now });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ userId: "u-head", link: "/dashboard" });
    expect(items[0].message).toContain("Vous êtes vous-même planifié.");
  });

  it("exclut l'auteur du changement", async () => {
    const { items } = await collectEventChangeNotices(tx, "church-1", [moved()], { actorId: "u-head", now });
    expect(items.map((i) => i.userId)).not.toContain("u-head");
  });

  it("annulation : message « annulé », service retiré", async () => {
    const { items } = await collectEventChangeNotices(tx, "church-1", [{ kind: "CANCELLED", eventId: "evt-1" }], { now });
    const star = byUser(items)["u-star"];
    expect(star).toMatchObject({ type: "EVENT_CANCELLED", title: "Événement annulé : Culte" });
    expect(star.message).toMatch(/est annulé/);
    expect(star.message).toMatch(/retiré de votre planning/);
  });

  it.each([
    ["événement passé", () => moved("evt-1", new Date("2026-10-25T09:00:00Z"), later)],
    ["date inchangée", () => moved("evt-1", evtDate, evtDate)],
  ])("ne produit rien : %s", async (_label, change) => {
    const { items } = await collectEventChangeNotices(tx, "church-1", [change()], { now });
    expect(items).toEqual([]);
  });

  it("ne produit rien pour un événement sans personne planifiée (pas même aux encadrants)", async () => {
    setup({ plannings: [] });
    const { items } = await collectEventChangeNotices(tx, "church-1", [{ kind: "CANCELLED", eventId: "evt-1" }], { now });
    expect(items).toEqual([]);
    expect(prismaMock.userDepartment.findMany).not.toHaveBeenCalled();
  });

  it("annulation d'un événement passé : rien", async () => {
    setup({ events: [{ id: "evt-1", title: "Culte", date: new Date("2026-10-01T09:00:00Z") }] });
    const { items } = await collectEventChangeNotices(tx, "church-1", [{ kind: "CANCELLED", eventId: "evt-1" }], { now });
    expect(items).toEqual([]);
  });

  it("série : une seule notification par destinataire, une ligne par événement", async () => {
    const d2 = new Date("2026-11-15T09:00:00Z");
    setup({
      events: [
        { id: "evt-1", title: "Culte", date: evtDate },
        { id: "evt-2", title: "Culte", date: d2 },
      ],
      plannings: [planned("evt-1", "dept-L", louange, ["u-star"]), planned("evt-2", "dept-L", louange, ["u-star"])],
      ministers: [],
    });
    const { items } = await collectEventChangeNotices(
      tx,
      "church-1",
      [moved("evt-1"), moved("evt-2", d2, new Date("2026-11-15T09:30:00Z"))],
      { now }
    );
    expect(items.map((i) => i.userId).sort()).toEqual(["u-head", "u-star"]);
    const star = byUser(items)["u-star"];
    expect(star.title).toBe("2 événements déplacés");
    expect(star.message.match(/« Culte »/g)).toHaveLength(2);
  });

  it("un STAR planifié dans deux départements du même événement : une seule notification", async () => {
    setup({ plannings: [planned("evt-1", "dept-L", louange, ["u-star"]), planned("evt-1", "dept-A", accueil, ["u-star"])], heads: [], ministers: [] });
    const { items } = await collectEventChangeNotices(tx, "church-1", [moved()], { now });
    expect(items).toHaveLength(1);
    expect(items[0].message.match(/« Culte »/g)).toHaveLength(1);
  });
});

describe("sendEventChangeNotices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envoie dans le domaine planning, sans transaction (email selon préférence), et compte", async () => {
    createNotification.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("smtp"));
    const item = { userId: "u-1", type: "EVENT_CANCELLED" as const, title: "t", message: "m", link: "/planning" };
    const res = await sendEventChangeNotices({ items: [item, { ...item, userId: "u-2" }] });
    expect(res).toEqual({ notified: 1 });
    expect(createNotification).toHaveBeenCalledWith({ ...item, domain: "planning" });
    expect(createNotification.mock.calls[0]).toHaveLength(1);
  });

  it("rien à envoyer : aucun appel", async () => {
    expect(await sendEventChangeNotices({ items: [] })).toEqual({ notified: 0 });
    expect(createNotification).not.toHaveBeenCalled();
  });
});
