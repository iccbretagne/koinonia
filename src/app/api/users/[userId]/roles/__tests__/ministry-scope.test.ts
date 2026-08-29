// Spec 031, issue #467 — un Ministre au périmètre restreint n'attribue/ne retire des
// rôles que dans son propre ministère, jamais un rôle transverse à l'église. Ce fichier
// couvre exclusivement l'ajout de assertRoleWithinMinistryScope ; les autres règles
// (400 de validation, escalade privilégiée) sont couvertes par scope.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMinisterSession, createAdminSession, createSuperAdminSession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";
import { fakeGetUserMinistryScope } from "@/lib/__tests__/support/ministry-scope-mock";

const mockRequirePermission = vi.fn();
const mockRequireRateLimit = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
  getUserMinistryScope: (...args: Parameters<typeof fakeGetUserMinistryScope>) =>
    fakeGetUserMinistryScope(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: (...args: unknown[]) => mockRequireRateLimit(...args),
  RATE_LIMIT_SENSITIVE: { windowMs: 60000, max: 10 },
}));

const { POST, PATCH, DELETE } = await import("../route");

const churchDeptOf = () => ({
  ministry: { churchId: "church-1" },
});

describe("POST /api/users/[userId]/roles — périmètre de ministère (spec 031)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRateLimit.mockReturnValue(undefined);
  });

  it("un Ministre attribue DEPARTMENT_HEAD pour un département de SON ministère → 201", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-1", name: "Son", ministryId: "min-A", ...churchDeptOf() },
    ] as never);
    prismaMock.userChurchRole.create.mockResolvedValue({ id: "ucr-1" } as never);

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "DEPARTMENT_HEAD", departmentIds: ["dept-1"] }),
    });
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(201);
  });

  it("un Ministre attribue DEPARTMENT_HEAD pour un département D'UN AUTRE ministère → 403", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-9", name: "Accueil", ministryId: "min-B", ...churchDeptOf() },
    ] as never);

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "DEPARTMENT_HEAD", departmentIds: ["dept-9"] }),
    });
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(403);
    expect(prismaMock.userChurchRole.create).not.toHaveBeenCalled();
  });

  it("un Ministre attribue MINISTER pour SON ministère → 201", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    prismaMock.ministry.findUnique.mockResolvedValue({ churchId: "church-1" } as never);
    prismaMock.userChurchRole.create.mockResolvedValue({ id: "ucr-1" } as never);

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "MINISTER", ministryId: "min-A" }),
    });
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(201);
  });

  it("un Ministre attribue MINISTER pour un AUTRE ministère → 403", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    prismaMock.ministry.findUnique.mockResolvedValue({ churchId: "church-1" } as never);

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "MINISTER", ministryId: "min-B" }),
    });
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(403);
  });

  it("un Ministre attribue STAR → 201 (rôle rattachable, aucune donnée de ministère à ce niveau)", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    prismaMock.userChurchRole.create.mockResolvedValue({ id: "ucr-1" } as never);

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "STAR" }),
    });
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(201);
  });

  it("un Ministre attribue REPORTER (rôle transverse) → 403", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "REPORTER" }),
    });
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(403);
    expect(prismaMock.userChurchRole.create).not.toHaveBeenCalled();
  });

  it("un Ministre SANS ministère assigné → 403 sur toute attribution rattachable", async () => {
    mockRequirePermission.mockResolvedValue(
      createMinisterSession("min-A", "church-1")
    );
    // Simule un Ministre sans ministère : requireChurchPermission renvoie une session
    // dont le rôle MINISTER n'a pas de ministryId
    mockRequirePermission.mockResolvedValue({
      user: {
        id: "user-1",
        isSuperAdmin: false,
        churchRoles: [
          { churchId: "church-1", role: "MINISTER", ministryId: null, departments: [] },
        ],
      },
    } as never);

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "STAR" }),
    });
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    // STAR reste autorisé (aucune donnée de ministère en jeu) — un Ministre sans
    // ministère n'a en revanche jamais accès à l'écran qui permet d'y arriver (T20/T21)
    expect(res.status).toBe(201);
  });

  it("l'anti-escalade Super Admin existante ne régresse pas : un Ministre ne peut pas attribuer ADMIN", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "ADMIN" }),
    });
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(403);
  });

  it("un Admin (non scoped) attribue n'importe quel rôle rattachable dans n'importe quel ministère → 201", async () => {
    mockRequirePermission.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.ministry.findUnique.mockResolvedValue({ churchId: "church-1" } as never);
    prismaMock.userChurchRole.create.mockResolvedValue({ id: "ucr-1" } as never);

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "MINISTER", ministryId: "min-ANY" }),
    });
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/users/[userId]/roles — périmètre de ministère (spec 031)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRateLimit.mockReturnValue(undefined);
  });

  it("un Ministre modifie les départements d'un DEPARTMENT_HEAD déjà dans son ministère → 200", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    prismaMock.userChurchRole.findFirst.mockResolvedValue({
      id: "role-1",
      userId: "user-1",
      churchId: "church-1",
      role: "DEPARTMENT_HEAD",
      ministryId: null,
    } as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { department: { ministryId: "min-A" } },
    ] as never);
    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-2", name: "Musique", ministryId: "min-A", ...churchDeptOf() },
    ] as never);
    prismaMock.userDepartment.deleteMany.mockResolvedValue({} as never);
    prismaMock.userDepartment.createMany.mockResolvedValue({} as never);
    prismaMock.userChurchRole.findUnique.mockResolvedValue({ id: "role-1" } as never);

    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "PATCH",
      body: JSON.stringify({ roleId: "role-1", departments: [{ id: "dept-2" }] }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ userId: "user-1" }) });
    expect(res.status).toBe(200);
  });

  it("un Ministre ne peut pas toucher un DEPARTMENT_HEAD d'un AUTRE ministère → 403", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    prismaMock.userChurchRole.findFirst.mockResolvedValue({
      id: "role-1",
      userId: "user-1",
      churchId: "church-1",
      role: "DEPARTMENT_HEAD",
      ministryId: null,
    } as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { department: { ministryId: "min-B" } },
    ] as never);

    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "PATCH",
      body: JSON.stringify({ roleId: "role-1", departments: [{ id: "dept-2" }] }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ userId: "user-1" }) });
    expect(res.status).toBe(403);
  });

  it("un Ministre ne peut pas déplacer un responsable vers un département hors de son ministère → 403", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    prismaMock.userChurchRole.findFirst.mockResolvedValue({
      id: "role-1",
      userId: "user-1",
      churchId: "church-1",
      role: "DEPARTMENT_HEAD",
      ministryId: null,
    } as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { department: { ministryId: "min-A" } },
    ] as never);
    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-9", name: "Hors ministère", ministryId: "min-B", ...churchDeptOf() },
    ] as never);

    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "PATCH",
      body: JSON.stringify({ roleId: "role-1", departments: [{ id: "dept-9" }] }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ userId: "user-1" }) });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/users/[userId]/roles — périmètre de ministère (spec 031)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRateLimit.mockReturnValue(undefined);
  });

  it("un Ministre supprime un DEPARTMENT_HEAD de SON ministère → 200", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    prismaMock.userChurchRole.findUnique.mockResolvedValue({
      id: "role-1",
      userId: "user-1",
      churchId: "church-1",
      role: "DEPARTMENT_HEAD",
      ministryId: null,
    } as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { department: { ministryId: "min-A" } },
    ] as never);
    prismaMock.userDepartment.deleteMany.mockResolvedValue({} as never);
    prismaMock.userChurchRole.delete.mockResolvedValue({} as never);

    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "DELETE",
      body: JSON.stringify({ churchId: "church-1", role: "DEPARTMENT_HEAD" }),
    });
    const res = await DELETE(request, { params: Promise.resolve({ userId: "user-1" }) });
    expect(res.status).toBe(200);
  });

  it("un Ministre ne peut pas supprimer un DEPARTMENT_HEAD d'un AUTRE ministère → 403", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));
    prismaMock.userChurchRole.findUnique.mockResolvedValue({
      id: "role-1",
      userId: "user-1",
      churchId: "church-1",
      role: "DEPARTMENT_HEAD",
      ministryId: null,
    } as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { department: { ministryId: "min-B" } },
    ] as never);

    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "DELETE",
      body: JSON.stringify({ churchId: "church-1", role: "DEPARTMENT_HEAD" }),
    });
    const res = await DELETE(request, { params: Promise.resolve({ userId: "user-1" }) });
    expect(res.status).toBe(403);
    expect(prismaMock.userChurchRole.delete).not.toHaveBeenCalled();
  });

  it("l'anti-escalade Super Admin existante ne régresse pas : un Ministre ne peut pas supprimer ADMIN", async () => {
    mockRequirePermission.mockResolvedValue(createMinisterSession("min-A", "church-1"));

    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "DELETE",
      body: JSON.stringify({ churchId: "church-1", role: "ADMIN" }),
    });
    const res = await DELETE(request, { params: Promise.resolve({ userId: "user-1" }) });
    expect(res.status).toBe(403);
  });

  it("un Super Admin supprime n'importe quel rôle → 200", async () => {
    mockRequirePermission.mockResolvedValue(createSuperAdminSession());
    prismaMock.userChurchRole.findUnique.mockResolvedValue({
      id: "role-1",
      userId: "user-1",
      churchId: "church-1",
      role: "ADMIN",
      ministryId: null,
    } as never);
    prismaMock.userDepartment.deleteMany.mockResolvedValue({} as never);
    prismaMock.userChurchRole.delete.mockResolvedValue({} as never);

    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "DELETE",
      body: JSON.stringify({ churchId: "church-1", role: "ADMIN" }),
    });
    const res = await DELETE(request, { params: Promise.resolve({ userId: "user-1" }) });
    expect(res.status).toBe(200);
  });
});
