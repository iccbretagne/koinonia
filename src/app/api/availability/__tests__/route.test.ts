import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession, createAuthScopeMocks } from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  requireChurchPermission: (...a: unknown[]) => mockRequirePermission(...a),
  ...createAuthScopeMocks(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockList = vi.fn();
const mockSave = vi.fn();
const mockMemberScope = vi.fn();
vi.mock("@/modules/planning", () => ({
  listMemberAvailability: (...a: unknown[]) => mockList(...a),
  saveResponses: (...a: unknown[]) => mockSave(...a),
  getMemberScope: (...a: unknown[]) => mockMemberScope(...a),
}));

const { GET, PUT } = await import("../route");

const put = (body: unknown) =>
  PUT(new Request("http://localhost/api/availability", { method: "PUT", body: JSON.stringify(body) }));

const answers = [{ eventId: "evt-1", answer: "AVAILABLE" }];

describe("/api/availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.memberUserLink.findMany.mockResolvedValue([{ memberId: "m-own" }] as never);
    mockList.mockResolvedValue({ months: [], events: [] });
    mockSave.mockResolvedValue({ updated: 1, alerts: 0 });
  });

  it("401/erreur d'authentification relayée", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    const res = await GET(new Request("http://localhost/api/availability?churchId=church-1"));
    expect(res.status).toBe(401);
  });

  it("GET : 400 sans churchId", async () => {
    const res = await GET(new Request("http://localhost/api/availability"));
    expect(res.status).toBe(400);
  });

  it("GET : renvoie les disponibilités de la fiche liée au compte", async () => {
    const res = await GET(new Request("http://localhost/api/availability?churchId=church-1&month=2026-11"));
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("m-own", "church-1", new Date("2026-11-01T00:00:00.000Z"));
    expect(await res.json()).toMatchObject({ memberId: "m-own", isSelf: true });
  });

  it("GET : 404 si aucun STAR n'est lié au compte", async () => {
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/availability?churchId=church-1"));
    expect(res.status).toBe(404);
  });

  it("GET : mois invalide → 400", async () => {
    const res = await GET(new Request("http://localhost/api/availability?churchId=church-1&month=nope"));
    expect(res.status).toBe(400);
  });

  it("PUT : le STAR répond pour lui-même sans permission particulière", async () => {
    const res = await put({ churchId: "church-1", answers });
    expect(res.status).toBe(200);
    expect(mockRequirePermission).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ memberId: "m-own", churchId: "church-1", actorId: "user-1" }));
  });

  it("PUT : réponse invalide → 400, rien enregistré", async () => {
    const res = await put({ churchId: "church-1", answers: [{ eventId: "evt-1", answer: "MAYBE" }] });
    expect(res.status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("PUT « Répondre pour… » : exige planning:edit et refuse un STAR d'une autre église", async () => {
    mockMemberScope.mockResolvedValue({ churchId: "church-2", departmentIds: ["dept-1"] });
    const res = await put({ churchId: "church-1", memberId: "m-other", answers });
    expect(mockRequirePermission).toHaveBeenCalledWith("planning:edit", "church-1");
    expect(res.status).toBe(404);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("PUT « Répondre pour… » : un responsable borné ne répond que dans ses départements", async () => {
    const head = createDepartmentHeadSession([{ id: "dept-A", name: "A" }]);
    mockRequireAuth.mockResolvedValue(head);
    mockMemberScope.mockResolvedValue({ churchId: "church-1", departmentIds: ["dept-A", "dept-B"] });

    const res = await put({ churchId: "church-1", memberId: "m-other", answers });

    expect(res.status).toBe(200);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: "m-other", answers: [{ ...answers[0], departmentIds: ["dept-A"] }] })
    );
  });

  it("PUT « Répondre pour… » : 403 si le STAR est hors périmètre du responsable", async () => {
    mockRequireAuth.mockResolvedValue(createDepartmentHeadSession([{ id: "dept-A", name: "A" }]));
    mockMemberScope.mockResolvedValue({ churchId: "church-1", departmentIds: ["dept-Z"] });

    const res = await put({ churchId: "church-1", memberId: "m-other", answers });

    expect(res.status).toBe(403);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("PUT : un département demandé hors périmètre est refusé (403)", async () => {
    mockRequireAuth.mockResolvedValue(createDepartmentHeadSession([{ id: "dept-A", name: "A" }]));
    mockMemberScope.mockResolvedValue({ churchId: "church-1", departmentIds: ["dept-A", "dept-B"] });

    const res = await put({
      churchId: "church-1",
      memberId: "m-other",
      answers: [{ eventId: "evt-1", answer: "AVAILABLE", departmentIds: ["dept-B"] }],
    });

    expect(res.status).toBe(403);
  });
});
