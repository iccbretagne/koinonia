import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminSession, createDepartmentHeadSession, createMinisterSession, createStarSession, createSuperAdminSession } from "@/__mocks__/auth";
import { ApiError } from "@/lib/api-utils";
import type { Session } from "next-auth";

let session: Session;
const PUBLISHERS = new Set(["SUPER_ADMIN", "ADMIN", "SECRETARY"]);
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => session,
  requireSuperAdmin: async () => {
    if (!session.user.isSuperAdmin) throw new Error("FORBIDDEN");
    return session;
  },
  requireChurchPermission: async (_permission: string, churchId: string) => {
    const ok = session.user.isSuperAdmin || session.user.churchRoles.some((r) => r.churchId === churchId && PUBLISHERS.has(r.role));
    if (!ok) throw new Error("FORBIDDEN");
    return session;
  },
}));
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: vi.fn(), RATE_LIMIT_MUTATION: {} }));

const messages = {
  listMessages: vi.fn().mockResolvedValue([]),
  createMessage: vi.fn().mockResolvedValue({ id: "m1" }),
  countAudience: vi.fn().mockResolvedValue({ recipients: 3, membersWithoutAccount: 0 }),
  getMessageChurchId: vi.fn().mockResolvedValue("church-1"),
  getMessageForAuthor: vi.fn().mockResolvedValue({ id: "m1", stats: {} }),
  getMessageForViewer: vi.fn().mockResolvedValue({ id: "m1" }),
  updateMessage: vi.fn().mockResolvedValue({ id: "m1" }),
  withdrawMessage: vi.fn().mockResolvedValue({ id: "m1" }),
  recordReceipt: vi.fn().mockResolvedValue(undefined),
  messageViewerFromSession: (s: Session) => ({ userId: s.user.id, churchIds: s.user.churchRoles.map((r) => r.churchId) }),
};
vi.mock("@/modules/messages", () => messages);

const list = await import("../route");
const count = await import("../audience-count/route");
const item = await import("../[id]/route");
const withdraw = await import("../[id]/withdraw/route");
const receipt = await import("../[id]/receipt/route");

const params = { params: Promise.resolve({ id: "m1" }) };
const json = (body: unknown, method = "POST") =>
  new Request("http://localhost/api/system-messages", { method, body: JSON.stringify(body) });
const createBody = {
  scope: "church",
  churchId: "church-1",
  title: "Maintenance",
  body: "Samedi",
  audience: { roles: [], ministryIds: [], departmentIds: [], headsOnly: false },
  endsAt: new Date(Date.now() + 3600_000).toISOString(),
};

describe("/api/system-messages (spec 071)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session = createAdminSession();
  });

  it.each([
    ["Ministre", () => createMinisterSession("min-1")],
    ["Resp. département", () => createDepartmentHeadSession([{ id: "dept-1", name: "Choristes" }])],
    ["STAR", () => createStarSession()],
  ])("403 pour un %s : liste, publication, décompte, modification, retrait", async (_label, make) => {
    session = make();
    expect((await list.GET(new Request("http://localhost/api/system-messages?churchId=church-1"))).status).toBe(403);
    expect((await list.POST(json(createBody))).status).toBe(403);
    expect((await count.POST(json({ scope: "church", churchId: "church-1", audience: {} }))).status).toBe(403);
    expect((await item.PATCH(json({ title: "X" }, "PATCH"), params)).status).toBe(403);
    expect((await withdraw.POST(json({}), params)).status).toBe(403);
    expect(messages.createMessage).not.toHaveBeenCalled();
    expect(messages.withdrawMessage).not.toHaveBeenCalled();
  });

  it("Admin : publication dans son église (201)", async () => {
    const res = await list.POST(json(createBody));
    expect(res.status).toBe(201);
    expect(messages.createMessage).toHaveBeenCalledWith(expect.objectContaining({ churchId: "church-1" }), { id: "user-1" });
  });

  it("toute l'instance : refusée à l'Admin, permise au Super Admin", async () => {
    const instanceBody = { ...createBody, scope: "instance" };
    expect((await list.POST(json(instanceBody))).status).toBe(403);
    session = createSuperAdminSession();
    expect((await list.POST(json(instanceBody))).status).toBe(201);
  });

  it("400 sur une date de fin passée", async () => {
    const res = await list.POST(json({ ...createBody, endsAt: new Date(Date.now() - 1000).toISOString() }));
    expect(res.status).toBe(400);
  });

  it("modification et retrait sur l'église du message, pas celle du client", async () => {
    messages.getMessageChurchId.mockResolvedValueOnce("church-2");
    expect((await item.PATCH(json({ title: "X" }, "PATCH"), params)).status).toBe(403);
    expect((await item.PATCH(json({ title: "X" }, "PATCH"), params)).status).toBe(200);
    expect((await withdraw.POST(json({}), params)).status).toBe(200);
  });

  it("détail : auteur avec statistiques, public sans, 404 hors public", async () => {
    expect((await item.GET(new Request("http://localhost"), params)).status).toBe(200);
    expect(messages.getMessageForAuthor).toHaveBeenCalled();

    session = createStarSession();
    expect((await item.GET(new Request("http://localhost"), params)).status).toBe(200);
    expect(messages.getMessageForViewer).toHaveBeenCalled();

    messages.getMessageForViewer.mockRejectedValueOnce(new ApiError(404, "Message introuvable"));
    expect((await item.GET(new Request("http://localhost"), params)).status).toBe(404);
  });

  it("reçu : 204, action validée, refus du service transmis", async () => {
    session = createStarSession();
    expect((await receipt.POST(json({ action: "dismiss" }), params)).status).toBe(204);
    expect(messages.recordReceipt).toHaveBeenCalledWith("m1", expect.objectContaining({ userId: "user-1" }), "dismiss");
    expect((await receipt.POST(json({ action: "delete" }), params)).status).toBe(400);
    messages.recordReceipt.mockRejectedValueOnce(new ApiError(404, "Message introuvable"));
    expect((await receipt.POST(json({ action: "seen" }), params)).status).toBe(404);
  });
});
