import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminSession, createMinisterSession, createSecretarySession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

const mockRequirePermission = vi.fn();
const mockRequireRateLimit = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: (...args: unknown[]) => mockRequireRateLimit(...args),
  RATE_LIMIT_SENSITIVE: { windowMs: 60000, max: 10 },
}));

const { POST } = await import("../route");

describe("POST /api/users/[userId]/roles — scope validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    mockRequireRateLimit.mockReturnValue(undefined);
  });

  it("returns 400 when MINISTER role has no ministryId", async () => {
    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "MINISTER" }),
    });

    const res = await POST(request, { params: Promise.resolve({ userId: "user-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("ministère");
  });

  it("returns 400 when DEPARTMENT_HEAD role has no departments", async () => {
    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "DEPARTMENT_HEAD" }),
    });

    const res = await POST(request, { params: Promise.resolve({ userId: "user-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("département");
  });

  it("returns 400 when department belongs to another church", async () => {
    prismaMock.ministry.findUnique.mockResolvedValue(null);
    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-1", name: "Choristes", ministry: { id: "min-1", churchId: "church-OTHER" } },
    ] as never);

    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        role: "DEPARTMENT_HEAD",
        departmentIds: ["dept-1"],
      }),
    });

    const res = await POST(request, { params: Promise.resolve({ userId: "user-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("église");
  });

  it("returns 403 when non-super-admin tries to assign ADMIN role", async () => {
    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "ADMIN" }),
    });

    const res = await POST(request, { params: Promise.resolve({ userId: "user-1" }) });

    expect(res.status).toBe(403);
  });
});

// ── BLOCKER-1 : MINISTER ne doit pas pouvoir assigner des rôles ───────────────

describe("BLOCKER-1 : POST /api/users/[userId]/roles — RBAC events:manage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRateLimit.mockReturnValue(undefined);
  });

  it("MINISTER cannot assign role — requireChurchPermission rejects (events:manage)", async () => {
    // Simule le rejet de la permission (MINISTER n'a pas events:manage)
    mockRequirePermission.mockRejectedValue(
      Object.assign(new Error("FORBIDDEN"), { status: 403 })
    );

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        role: "DEPARTMENT_HEAD",
        departmentIds: ["dept-1"],
      }),
    });

    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(403);
  });

  it("ADMIN can assign DEPARTMENT_HEAD role", async () => {
    mockRequirePermission.mockResolvedValue(createAdminSession("church-1"));

    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-1", name: "Son", ministry: { churchId: "church-1" } },
    ] as never);
    prismaMock.userChurchRole.create.mockResolvedValue({
      id: "ucr-1",
      userId: "user-2",
      churchId: "church-1",
      role: "DEPARTMENT_HEAD",
      ministryId: null,
      church: { id: "church-1", name: "Test Church" },
      ministry: null,
      departments: [{ department: { id: "dept-1", name: "Son" } }],
    } as never);

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        role: "DEPARTMENT_HEAD",
        departmentIds: ["dept-1"],
      }),
    });

    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(201);
  });

  it("SECRETARY peut assigner DEPARTMENT_HEAD (décision v1.0 documentée)", async () => {
    // SECRETARY a events:manage → peut gérer les rôles non-privilégiés.
    // Décision explicite : SECRETARY est un rôle de confiance élevée dans ce modèle.
    mockRequirePermission.mockResolvedValue(createSecretarySession("church-1"));

    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-1", name: "Accueil", ministry: { churchId: "church-1" } },
    ] as never);
    prismaMock.userChurchRole.create.mockResolvedValue({
      id: "ucr-2",
      userId: "user-3",
      churchId: "church-1",
      role: "DEPARTMENT_HEAD",
      ministryId: null,
      church: { id: "church-1", name: "Test Church" },
      ministry: null,
      departments: [{ department: { id: "dept-1", name: "Accueil" } }],
    } as never);

    const request = new Request("http://localhost/api/users/user-3/roles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        role: "DEPARTMENT_HEAD",
        departmentIds: ["dept-1"],
      }),
    });

    const res = await POST(request, { params: Promise.resolve({ userId: "user-3" }) });
    expect(res.status).toBe(201);
  });

  it("MINISTER session — mockear como si tuviera events:manage devuelve 201", async () => {
    // Ce test vérifie que quand MINISTER est simulé AVEC la permission (cas positif
    // de la logique interne), l'assignation fonctionne.
    // En production, MINISTER n'a PAS events:manage, donc requireChurchPermission lèvera FORBIDDEN.
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-1", "church-1"));

    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-1", name: "Son", ministry: { churchId: "church-1" } },
    ] as never);
    prismaMock.userChurchRole.create.mockResolvedValue({
      id: "ucr-1",
      userId: "user-2",
      churchId: "church-1",
      role: "DEPARTMENT_HEAD",
      ministryId: null,
      church: { id: "church-1", name: "Test Church" },
      ministry: null,
      departments: [{ department: { id: "dept-1", name: "Son" } }],
    } as never);

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        role: "DEPARTMENT_HEAD",
        departmentIds: ["dept-1"],
      }),
    });

    // Note : ici le mock laisse passer la permission, c'est la permission réelle
    // (events:manage) qui bloquerait en production — ce test vérifie la logique interne
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(201);
  });
});
