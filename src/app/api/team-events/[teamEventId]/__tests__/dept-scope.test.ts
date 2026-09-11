import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession } from "@/__mocks__/auth";
import { fakeRequireDepartmentAccess } from "@/lib/__tests__/support/dept-scope-mock";

let currentSession: Session;
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
const mockRequireChurchPermission = vi.fn(() => currentSession);

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: () => mockRequireChurchPermission(),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
  requireDepartmentAccess: (...args: Parameters<typeof fakeRequireDepartmentAccess>) =>
    fakeRequireDepartmentAccess(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { PUT, DELETE } = await import("../route");
const makeParams = (teamEventId: string) => Promise.resolve({ teamEventId });

const SCOPE_INFO = {
  id: "te-1",
  churchId: "church-1",
  departmentId: "dept-A",
  startsAt: new Date("2026-09-14T18:00:00"),
  seriesId: null,
};

function makeUpdateBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Réunion",
    startsAt: "2026-09-14T18:00:00",
    endsAt: "2026-09-14T19:00:00",
    ...overrides,
  };
}

describe("Périmètre — /api/team-events/[teamEventId] (spec 044)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.teamEvent.findUnique.mockResolvedValue(SCOPE_INFO);
    prismaMock.teamEvent.update.mockResolvedValue({});
    prismaMock.teamEvent.delete.mockResolvedValue({});
    prismaMock.teamEvent.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("PUT : hors périmètre de département → 403", async () => {
    currentSession = createDepartmentHeadSession([{ id: "dept-B", name: "B" }]);
    const request = new Request("http://localhost", { method: "PUT", body: JSON.stringify(makeUpdateBody()) });
    const res = await PUT(request, { params: makeParams("te-1") });
    expect(res.status).toBe(403);
  });

  it("PUT : dans le périmètre → 200", async () => {
    currentSession = createDepartmentHeadSession([{ id: "dept-A", name: "A" }]);
    const request = new Request("http://localhost", { method: "PUT", body: JSON.stringify(makeUpdateBody()) });
    const res = await PUT(request, { params: makeParams("te-1") });
    expect(res.status).toBe(200);
  });

  it("PUT : événement introuvable (autre église / supprimé) → 404", async () => {
    currentSession = createAdminSession();
    prismaMock.teamEvent.findUnique.mockResolvedValue(null);
    const request = new Request("http://localhost", { method: "PUT", body: JSON.stringify(makeUpdateBody()) });
    const res = await PUT(request, { params: makeParams("te-inconnu") });
    expect(res.status).toBe(404);
  });

  it("DELETE : hors périmètre → 403", async () => {
    currentSession = createDepartmentHeadSession([{ id: "dept-B", name: "B" }]);
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: makeParams("te-1"),
    });
    expect(res.status).toBe(403);
  });

  it("DELETE : scope=following transmis correctement au service", async () => {
    currentSession = createAdminSession();
    prismaMock.teamEvent.findUnique.mockResolvedValue({ ...SCOPE_INFO, seriesId: "series-1" });
    const res = await DELETE(
      new Request("http://localhost?scope=following", { method: "DELETE" }),
      { params: makeParams("te-1") }
    );
    expect(res.status).toBe(200);
    expect(prismaMock.teamEvent.deleteMany).toHaveBeenCalledWith({
      where: { seriesId: "series-1", startsAt: { gte: SCOPE_INFO.startsAt } },
    });
    expect(prismaMock.teamEvent.delete).not.toHaveBeenCalled();
  });

  it("DELETE : sans scope (défaut occurrence) supprime uniquement l'événement visé", async () => {
    currentSession = createAdminSession();
    prismaMock.teamEvent.findUnique.mockResolvedValue({ ...SCOPE_INFO, seriesId: "series-1" });
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: makeParams("te-1"),
    });
    expect(res.status).toBe(200);
    expect(prismaMock.teamEvent.delete).toHaveBeenCalledWith({ where: { id: "te-1" } });
  });
});
