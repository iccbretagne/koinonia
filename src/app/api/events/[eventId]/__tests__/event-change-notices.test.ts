import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: vi.fn(async () => createAdminSession()),
  resolveChurchId: vi.fn(async () => "church-1"),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const NOTICES = { items: [{ userId: "u-star" }] };
const order: string[] = [];
const mockCollect = vi.fn(async (_tx: unknown, _churchId: string, changes: unknown[]) => {
  order.push("collect");
  return changes.length > 0 ? NOTICES : { items: [] };
});
const mockSend = vi.fn(async (n: { items: unknown[] }) => {
  order.push("send");
  return { notified: n.items.length };
});
const mockDeleteEvents = vi.fn(async () => {
  order.push("delete");
  return NOTICES;
});
vi.mock("@/modules/planning", () => ({
  deleteEvents: (...a: unknown[]) => mockDeleteEvents(...(a as [])),
  collectEventChangeNotices: (...a: [unknown, string, unknown[]]) => mockCollect(...a),
  sendEventChangeNotices: (...a: [{ items: unknown[] }]) => mockSend(...a),
  emptyEventChangeNotices: () => ({ items: [] }),
  planningBus: { emit: vi.fn() },
}));

// Le $transaction du mock exécute le callback : on trace la fin de transaction pour vérifier
// que l'envoi a lieu après le commit.
const runTx = prismaMock.$transaction.getMockImplementation()!;
prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
  const r = await runTx(arg as never);
  order.push("commit");
  return r;
});

const eventRoute = await import("../route");
const listRoute = await import("../../route");

const params = { params: Promise.resolve({ eventId: "evt-1" }) };
const put = (body: Record<string, unknown>) =>
  eventRoute.PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) }), params);
const patch = (body: Record<string, unknown>) =>
  listRoute.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }));

const oldDate = new Date("2099-11-08T09:00:00Z");

describe("routes événements — prévenir les planifiés (spec 059)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    order.length = 0;
    prismaMock.event.findUnique.mockResolvedValue({ id: "evt-1", date: oldDate, title: "Culte" } as never);
  });

  it("PUT avec une nouvelle heure : collecte le déplacement, envoie après le commit, renvoie notified", async () => {
    prismaMock.event.update.mockResolvedValue({ id: "evt-1", date: new Date("2099-11-08T10:00:00Z") } as never);

    const res = await put({ title: "Culte", type: "CULTE", date: "2099-11-08T10:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(mockCollect.mock.calls[0][2]).toEqual([
      { kind: "MOVED", eventId: "evt-1", previousDate: oldDate, newDate: new Date("2099-11-08T10:00:00Z") },
    ]);
    expect(order).toEqual(["collect", "commit", "send"]);
    expect((await res.json()).notified).toBe(1);
  });

  it("PUT sur toute la série : une seule collecte pour tous les événements", async () => {
    prismaMock.event.findUnique
      .mockResolvedValueOnce({ id: "evt-1", seriesId: null, isRecurrenceParent: true } as never)
      .mockResolvedValueOnce({ id: "evt-1" } as never);
    prismaMock.event.findMany.mockResolvedValue([
      { id: "evt-1", date: oldDate },
      { id: "evt-2", date: new Date("2099-11-15T09:00:00Z") },
    ] as never);

    const res = await put({ title: "Culte", type: "CULTE", date: "2099-11-08T10:00:00.000Z", applyToSeries: true });

    expect(res.status).toBe(200);
    expect(mockCollect).toHaveBeenCalledTimes(1);
    expect(mockCollect.mock.calls[0][2]).toHaveLength(2);
    expect(order.slice(-2)).toEqual(["commit", "send"]);
    expect((await res.json()).notified).toBe(1);
  });

  it("DELETE : envoie les notifications rendues par deleteEvents, après le commit", async () => {
    const res = await eventRoute.DELETE(new Request("http://localhost", { method: "DELETE" }), params);

    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith(NOTICES);
    expect(order).toEqual(["delete", "commit", "send"]);
    expect(await res.json()).toEqual({ success: true, notified: 1 });
  });

  it("PATCH suppression groupée : envoi après le commit, notified", async () => {
    const res = await patch({ ids: ["evt-1", "evt-2"], action: "delete" });

    expect(res.status).toBe(200);
    expect(order).toEqual(["delete", "commit", "send"]);
    expect(await res.json()).toEqual({ deleted: 2, notified: 1 });
  });

  it("PATCH modification groupée avec date : collecte un déplacement par événement", async () => {
    prismaMock.event.findMany.mockResolvedValue([{ id: "evt-1", date: oldDate }, { id: "evt-2", date: oldDate }] as never);

    const res = await patch({ ids: ["evt-1", "evt-2"], action: "update", data: { date: "2099-11-09" } });

    expect(res.status).toBe(200);
    expect(mockCollect.mock.calls[0][2]).toHaveLength(2);
    expect(order).toEqual(["collect", "commit", "send"]);
    expect((await res.json()).notified).toBe(1);
  });

  it("PATCH modification groupée du titre seul : aucune notification", async () => {
    const res = await patch({ ids: ["evt-1"], action: "update", data: { title: "Nouveau titre" } });

    expect(res.status).toBe(200);
    expect(mockCollect).not.toHaveBeenCalled();
    expect((await res.json()).notified).toBe(0);
  });
});
