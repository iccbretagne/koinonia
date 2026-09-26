/**
 * Tests — GET /api/member-link-requests (spec 054/#583, défaut B4).
 * `access:manage` remplace `members:manage` : la Secrétaire (qui n'avait pas `members:manage`)
 * voit désormais les demandes, et un Ministre au périmètre restreint ne voit que celles de son
 * ou ses ministères.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createAuthScopeMocks } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  ...createAuthScopeMocks(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: vi.fn(),
  RATE_LIMIT_SENSITIVE: { windowMs: 60000, max: 10 },
}));

const { GET } = await import("../route");

function secretarySession() {
  return {
    user: {
      id: "sec-1",
      isSuperAdmin: false,
      churchRoles: [{ churchId: "church-1", role: "SECRETARY", ministryId: null, departments: [] }],
    },
  };
}

function ministerSession(ministryId = "ministry-1") {
  return {
    user: {
      id: "min-1",
      isSuperAdmin: false,
      churchRoles: [{ churchId: "church-1", role: "MINISTER", ministryId, departments: [] }],
    },
  };
}

describe("GET /api/member-link-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.memberLinkRequest.findMany.mockResolvedValue([]);
  });

  it("la Secrétaire (access:manage, non restreinte) voit toutes les demandes — n'avait pas members:manage jusqu'ici", async () => {
    mockRequireChurchPermission.mockResolvedValue(secretarySession());

    const res = await GET(new Request("http://localhost?churchId=church-1"));

    expect(res.status).toBe(200);
    expect(prismaMock.memberLinkRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-1", status: "PENDING" } })
    );
  });

  it("un Ministre au périmètre restreint ne voit que les demandes de son ministère", async () => {
    mockRequireChurchPermission.mockResolvedValue(ministerSession("ministry-1"));

    const res = await GET(new Request("http://localhost?churchId=church-1"));

    expect(res.status).toBe(200);
    expect(prismaMock.memberLinkRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          churchId: "church-1",
          status: "PENDING",
          OR: [
            { ministryId: { in: ["ministry-1"] } },
            { department: { ministryId: { in: ["ministry-1"] } } },
          ],
        },
      })
    );
  });

  it("l'Admin voit toutes les demandes sans filtre de ministère", async () => {
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));

    const res = await GET(new Request("http://localhost?churchId=church-1"));

    expect(res.status).toBe(200);
    expect(prismaMock.memberLinkRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-1", status: "PENDING" } })
    );
  });
});
