import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequirePermission = vi.fn();
const mockResolveChurchId = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: vi.fn(),
  RATE_LIMIT_MUTATION: {},
}));
vi.mock("@/lib/request-executor", () => ({ executeRequest: vi.fn() }));

const { GET, POST } = await import("../route");
const { PATCH } = await import("../../requests/[id]/route");

describe("GET /api/requests — authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.request.findMany.mockResolvedValue([]);
    prismaMock.department.findMany.mockResolvedValue([]);
  });

  it("gates the list on members:view (not planning:view)", async () => {
    const request = new Request("http://localhost/api/requests?churchId=church-1");
    await GET(request);

    expect(mockRequirePermission).toHaveBeenCalledWith("members:view", "church-1");
  });

  it("returns 403 (FORBIDDEN) for a STAR without members:view", async () => {
    mockRequirePermission.mockRejectedValue(new Error("FORBIDDEN"));

    const request = new Request("http://localhost/api/requests?churchId=church-1");
    const res = await GET(request);

    expect(res.status).toBe(403);
  });

  it("expose assignedFunction et assignedDepts (spec 046) au lieu d'un unique assignedDept", async () => {
    prismaMock.request.findMany.mockResolvedValue([
      { id: "req-1", type: "VISUEL", childRequests: [] },
    ] as never);
    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-1", name: "Média A", function: "PRODUCTION_MEDIA" },
      { id: "dept-2", name: "Média B", function: "PRODUCTION_MEDIA" },
    ] as never);

    const request = new Request("http://localhost/api/requests?churchId=church-1");
    const res = await GET(request);
    const body = await res.json();

    expect(body[0].assignedFunction).toBe("PRODUCTION_MEDIA");
    expect(body[0].assignedDepts.map((d: { name: string }) => d.name)).toEqual([
      "Média A",
      "Média B",
    ]);
    expect(body[0].assignedDept).toBeUndefined();
  });
});

describe("POST /api/requests — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("gates VISUEL creation on members:view (not planning:view)", async () => {
    const request = new Request("http://localhost/api/requests", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        type: "VISUEL",
        title: "Test visuel",
      }),
    });
    await POST(request);

    expect(mockRequirePermission).toHaveBeenCalledWith("members:view", "church-1");
  });

  it("returns 403 (FORBIDDEN) for a STAR without members:view", async () => {
    mockRequirePermission.mockRejectedValue(new Error("FORBIDDEN"));

    const request = new Request("http://localhost/api/requests", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        type: "VISUEL",
        title: "Test visuel",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));

    const request = new Request("http://localhost/api/requests", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        type: "VISUEL",
        title: "Test visuel",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(401);
  });

  it("returns 400 with missing required fields (empty body)", async () => {
    const request = new Request("http://localhost/api/requests", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(request);

    expect(res.status).toBe(400);
  });

  it("returns 400 with invalid type", async () => {
    const request = new Request("http://localhost/api/requests", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        type: "INVALID_TYPE",
        title: "Test",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("invalide");
  });
});

describe("PATCH /api/requests/[id] — authorization", () => {
  const existingRequest = {
    id: "req-1",
    submittedById: "user-other",
    assignedDeptId: "dept-other",
    churchId: "church-1",
    type: "VISUEL",
    status: "EN_ATTENTE",
    announcementId: null,
    payload: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.department.findMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    prismaMock.request.findUnique.mockResolvedValue(existingRequest);
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));

    const request = new Request("http://localhost/api/requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "EN_COURS" }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ id: "req-1" }) });

    expect(res.status).toBe(401);
  });

  it("gates PATCH on members:view (not planning:view)", async () => {
    prismaMock.request.findUnique.mockResolvedValue(existingRequest);

    const request = new Request("http://localhost/api/requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "EN_COURS" }),
    });
    await PATCH(request, { params: Promise.resolve({ id: "req-1" }) });

    expect(mockRequirePermission).toHaveBeenCalledWith("members:view", "church-1");
  });

  it("returns 403 (FORBIDDEN) for a STAR without members:view", async () => {
    prismaMock.request.findUnique.mockResolvedValue(existingRequest);
    mockRequirePermission.mockRejectedValue(new Error("FORBIDDEN"));

    const request = new Request("http://localhost/api/requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "EN_COURS" }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ id: "req-1" }) });

    expect(res.status).toBe(403);
  });

  it("returns 404 when request doesn't exist", async () => {
    prismaMock.request.findUnique.mockResolvedValue(null);

    const request = new Request("http://localhost/api/requests/nonexistent", {
      method: "PATCH",
      body: JSON.stringify({ status: "EN_COURS" }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("introuvable");
  });

  it("returns 403 when user is not owner, not assigned dept member, and not manager", async () => {
    // Session user (user-1) is neither the owner (user-other), in the assigned dept (dept-other),
    // nor has events:manage — use a non-admin session
    const nonManagerSession = {
      ...createAdminSession(),
      user: {
        ...createAdminSession().user,
        id: "user-1",
        isSuperAdmin: false,
        churchRoles: [
          {
            id: "role-1",
            churchId: "church-1",
            role: "DEPARTMENT_HEAD" as const,
            ministryId: null,
            church: { id: "church-1", name: "Test Church", slug: "test-church" },
            departments: [{ department: { id: "dept-mine", name: "My Dept" } }],
          },
        ],
      },
    };
    mockRequirePermission.mockResolvedValue(nonManagerSession);
    prismaMock.request.findUnique.mockResolvedValue(existingRequest);

    const request = new Request("http://localhost/api/requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "EN_COURS" }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ id: "req-1" }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Accès refusé");
  });

  it("autorise un membre d'un second département portant la même fonction (spec 046)", async () => {
    const secondDeptSession = {
      ...createAdminSession(),
      user: {
        ...createAdminSession().user,
        id: "user-1",
        isSuperAdmin: false,
        churchRoles: [
          {
            id: "role-1",
            churchId: "church-1",
            role: "DEPARTMENT_HEAD" as const,
            ministryId: null,
            church: { id: "church-1", name: "Test Church", slug: "test-church" },
            departments: [{ department: { id: "dept-second", name: "Média B" } }],
          },
        ],
      },
    };
    mockRequirePermission.mockResolvedValue(secondDeptSession);
    prismaMock.request.findUnique.mockResolvedValue(existingRequest);
    // "dept-second" porte aussi PRODUCTION_MEDIA (fonction du type VISUEL), sans être le
    // premier département historiquement assigné.
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-second" }] as never);
    prismaMock.request.update.mockResolvedValue({
      id: "req-1",
      type: "VISUEL",
      status: "EN_COURS",
    } as never);

    const request = new Request("http://localhost/api/requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "EN_COURS" }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ id: "req-1" }) });

    expect(res.status).toBe(200);
  });

  it("returns 403 when owner tries to set status other than ANNULE", async () => {
    const ownerSession = {
      ...createAdminSession(),
      user: {
        ...createAdminSession().user,
        id: "user-owner",
        isSuperAdmin: false,
        churchRoles: [
          {
            id: "role-1",
            churchId: "church-1",
            role: "DEPARTMENT_HEAD" as const,
            ministryId: null,
            church: { id: "church-1", name: "Test Church", slug: "test-church" },
            departments: [],
          },
        ],
      },
    };
    mockRequirePermission.mockResolvedValue(ownerSession);
    prismaMock.request.findUnique.mockResolvedValue({
      ...existingRequest,
      submittedById: "user-owner",
      assignedDeptId: "dept-other",
    });

    const request = new Request("http://localhost/api/requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "APPROUVEE" }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ id: "req-1" }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("annuler");
  });

  it("returns 400 when refusing without reviewNotes", async () => {
    prismaMock.request.findUnique.mockResolvedValue(existingRequest);

    const request = new Request("http://localhost/api/requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "REFUSEE" }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ id: "req-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("note");
  });
});
