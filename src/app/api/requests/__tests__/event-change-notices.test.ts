import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: vi.fn(async () => createAdminSession()),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => undefined) }));

const NOTICES = { items: [{ userId: "u-star" }, { userId: "u-head" }] };
const order: string[] = [];
const mockExecute = vi.fn();
const mockSend = vi.fn(async (n: { items: unknown[] }) => {
  order.push("send");
  return { notified: n.items.length };
});
vi.mock("@/modules/planning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/planning")>()),
  executeRequest: (...a: unknown[]) => mockExecute(...a),
  sendEventChangeNotices: (...a: [{ items: unknown[] }]) => mockSend(...a),
}));

const runTx = prismaMock.$transaction.getMockImplementation()!;
prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
  const r = await runTx(arg as never);
  order.push("commit");
  return r;
});

const { PATCH } = await import("../[id]/route");

const approve = () =>
  PATCH(
    new Request("http://localhost/api/requests/req-1", { method: "PATCH", body: JSON.stringify({ status: "APPROUVEE" }) }),
    { params: Promise.resolve({ id: "req-1" }) }
  );

describe("PATCH /api/requests/[id] — demandes d'événement approuvées (spec 059)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    order.length = 0;
    prismaMock.department.findMany.mockResolvedValue([]);
    prismaMock.request.update.mockResolvedValue({ id: "req-1", type: "ANNULATION_EVENEMENT", status: "EXECUTEE" } as never);
  });

  it.each(["MODIFICATION_EVENEMENT", "ANNULATION_EVENEMENT"])(
    "%s : notifications envoyées après le commit, notified dans la réponse",
    async (type) => {
      prismaMock.request.findUnique.mockResolvedValue({
        id: "req-1", submittedById: "user-other", churchId: "church-1", type, status: "EN_ATTENTE",
        title: "Culte", announcementId: null, payload: { eventId: "evt-1" },
      } as never);
      mockExecute.mockImplementation(async () => {
        order.push("execute");
        return { success: true, resourceId: "evt-1", notices: NOTICES };
      });

      const res = await approve();

      expect(res.status).toBe(200);
      expect(mockSend).toHaveBeenCalledWith(NOTICES);
      expect(order).toEqual(["execute", "commit", "send"]);
      expect((await res.json()).notified).toBe(2);
    }
  );

  it("exécution sans notification (titre seul) : rien n'est envoyé", async () => {
    prismaMock.request.findUnique.mockResolvedValue({
      id: "req-1", submittedById: "user-other", churchId: "church-1", type: "MODIFICATION_EVENEMENT", status: "EN_ATTENTE",
      title: "Culte", announcementId: null, payload: { eventId: "evt-1", changes: { title: "x" } },
    } as never);
    mockExecute.mockResolvedValue({ success: true, resourceId: "evt-1" });

    const res = await approve();

    expect(mockSend).not.toHaveBeenCalled();
    expect((await res.json()).notified).toBe(0);
  });
});
