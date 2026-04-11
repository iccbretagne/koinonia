import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createSuperAdminSession } from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { GET, POST, PATCH } = await import("../route");

describe("GET /api/churches — super-admin only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as scoped admin (not isSuperAdmin)", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession());

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 for super-admin", async () => {
    mockRequireAuth.mockResolvedValue(createSuperAdminSession());
    prismaMock.church.findMany.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/churches — super-admin only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));

    const request = new Request("http://localhost/api/churches", {
      method: "POST",
      body: JSON.stringify({ name: "Nouvelle Église" }),
    });
    const res = await POST(request);
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as scoped admin", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession());

    const request = new Request("http://localhost/api/churches", {
      method: "POST",
      body: JSON.stringify({ name: "Nouvelle Église" }),
    });
    const res = await POST(request);
    expect(res.status).toBe(403);
  });

  it("creates church for super-admin", async () => {
    mockRequireAuth.mockResolvedValue(createSuperAdminSession());
    prismaMock.church.create.mockResolvedValue({ id: "c-new", name: "Nouvelle Église", slug: "nouvelle-eglise" });
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.upsert.mockResolvedValue({});

    const request = new Request("http://localhost/api/churches", {
      method: "POST",
      body: JSON.stringify({ name: "Nouvelle Église" }),
    });
    const res = await POST(request);
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/churches (bulk) — super-admin only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));

    const request = new Request("http://localhost/api/churches", {
      method: "PATCH",
      body: JSON.stringify({ ids: ["c-1"], action: "delete" }),
    });
    const res = await PATCH(request);
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as scoped admin", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession());

    const request = new Request("http://localhost/api/churches", {
      method: "PATCH",
      body: JSON.stringify({ ids: ["c-1"], action: "delete" }),
    });
    const res = await PATCH(request);
    expect(res.status).toBe(403);
  });
});
