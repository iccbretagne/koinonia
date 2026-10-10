import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockAccess = vi.fn();
const mockList = vi.fn();
vi.mock("@/modules/planning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/planning")>()),
  resolveRequestQueueAccess: (...args: unknown[]) => mockAccess(...args),
  listDoneRequests: (...args: unknown[]) => mockList(...args),
}));

const { GET } = await import("../route");

const get = (query: string) => GET(new Request(`http://localhost/api/requests/queue?${query}`));

describe("GET /api/requests/queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    mockAccess.mockResolvedValue({ configured: true, allowed: true, canManage: true });
    mockList.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("400 si la fonction ou l'église manque ou est invalide", async () => {
    expect((await get("churchId=church-1")).status).toBe(400);
    expect((await get("churchId=church-1&fn=ACCUEIL")).status).toBe(400);
    expect((await get("fn=SECRETARIAT")).status).toBe(400);
    expect((await get(`churchId=church-1&fn=SECRETARIAT&q=${"x".repeat(101)}`)).status).toBe(400);
  });

  it("exige planning:view dans l'église visée, puis l'accès à l'équipe", async () => {
    await get("churchId=church-1&fn=COMMUNICATION");
    expect(mockRequirePermission).toHaveBeenCalledWith("planning:view", "church-1");
    expect(mockAccess).toHaveBeenCalledWith(expect.anything(), "church-1", "COMMUNICATION");
  });

  it("403 hors de l'équipe", async () => {
    mockAccess.mockResolvedValue({ configured: true, allowed: false, canManage: false });
    const res = await get("churchId=church-1&fn=SECRETARIAT");
    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("liste vide si aucun département ne porte la fonction", async () => {
    mockAccess.mockResolvedValue({ configured: false, allowed: true, canManage: true });
    const res = await get("churchId=church-1&fn=PRODUCTION_MEDIA");
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
    expect(mockList).not.toHaveBeenCalled();
  });

  it("transmet le curseur et la recherche au service", async () => {
    mockList.mockResolvedValue({ items: [{ id: "r1" }], nextCursor: "c2" });
    const res = await get("churchId=church-1&fn=SECRETARIAT&cursor=c1&q=no%C3%ABl");
    expect(mockList).toHaveBeenCalledWith("church-1", "SECRETARIAT", { cursor: "c1", q: "noël" });
    expect(await res.json()).toEqual({ items: [{ id: "r1" }], nextCursor: "c2" });
  });
});
