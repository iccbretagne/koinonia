import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createSession } from "@/__mocks__/auth";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

// ─── Route imports ────────────────────────────────────────────────────────────

const { POST: postExport } = await import("../backups/config/export/route");
const { POST: postPreview } = await import("../backups/config/import/preview/route");
const { POST: postImport } = await import("../backups/config/import/route");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const superAdminSession = { ...createAdminSession(), user: { ...createAdminSession().user, isSuperAdmin: true } };
const regularSession = createSession({
  id: "user-regular",
  churchRoles: [{ id: "r1", churchId: "c1", role: "STAR", ministryId: null,
    church: { id: "c1", name: "Test", slug: "test" }, departments: [] }],
});

const baseChurch = {
  id: "c1", name: "ICC Rennes", slug: "icc-rennes",
  secretariatEmail: "sec@icc.fr", accountingEmail: null,
  primaryColor: "#5E17EB", createdAt: new Date(), updatedAt: new Date(),
  ministries: [],
};

const baseExportData = {
  _meta: {
    schemaVersion: 1,
    appVersion: "1.12.0",
    exportedAt: "2026-07-04T10:00:00.000Z",
    exportedBy: "admin@icc.fr",
    scope: "all" as const,
    categories: ["structure", "members", "links"] as const,
  },
  churches: [
    {
      id: "c1",
      name: "ICC Rennes",
      slug: "icc-rennes",
      secretariatEmail: "sec@icc.fr",
      accountingEmail: null,
      primaryColor: "#5E17EB",
      ministries: [
        {
          id: "m1",
          name: "Louange",
          isSystem: false,
          departments: [
            { id: "d1", name: "Choristes", isSystem: false, function: null },
          ],
        },
      ],
      members: [
        {
          id: "mbr1",
          firstName: "Alice",
          lastName: "Dupont",
          email: "alice@icc.fr",
          phone: null,
          departmentIds: ["d1"],
          isPrimaryDeptId: "d1",
        },
      ],
      userLinks: [
        { memberId: "mbr1", userEmail: "alice@icc.fr", churchId: "c1", validatedAt: null },
      ],
      userRoles: [
        { userEmail: "alice@icc.fr", role: "STAR", ministryId: null, departmentIds: [] },
      ],
    },
  ],
};

// ─── Export route ─────────────────────────────────────────────────────────────

describe("POST /api/admin/backups/config/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(superAdminSession);
  });

  it("retourne 403 pour un non-Super Admin", async () => {
    mockRequireAuth.mockResolvedValue(regularSession);
    const req = new Request("http://localhost/api/admin/backups/config/export", {
      method: "POST",
      body: JSON.stringify({ scope: "all", categories: ["structure"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postExport(req);
    expect(res.status).toBe(403);
  });

  it("exporte la configuration et retourne un fichier JSON téléchargeable", async () => {
    prismaMock.church.findMany.mockResolvedValue([{ ...baseChurch }]);
    prismaMock.ministry.findMany.mockResolvedValue([]);
    prismaMock.department.findMany.mockResolvedValue([]);
    prismaMock.memberDepartment.findMany.mockResolvedValue([]);
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);

    const req = new Request("http://localhost/api/admin/backups/config/export", {
      method: "POST",
      body: JSON.stringify({ scope: "all", categories: ["structure"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postExport(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment/);
    const json = await res.json();
    expect(json._meta.schemaVersion).toBe(1);
    expect(json._meta.categories).toContain("structure");
    expect(Array.isArray(json.churches)).toBe(true);
  });

  it("retourne 400 si aucune catégorie", async () => {
    const req = new Request("http://localhost/api/admin/backups/config/export", {
      method: "POST",
      body: JSON.stringify({ scope: "all", categories: [] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postExport(req);
    expect(res.status).toBe(400);
  });
});

// ─── Preview route ────────────────────────────────────────────────────────────

describe("POST /api/admin/backups/config/import/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(superAdminSession);
  });

  it("retourne 403 pour un non-Super Admin", async () => {
    mockRequireAuth.mockResolvedValue(regularSession);
    const req = new Request("http://localhost/api/admin/backups/config/import/preview", {
      method: "POST",
      body: JSON.stringify(baseExportData),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postPreview(req);
    expect(res.status).toBe(403);
  });

  it("retourne 400 si schemaVersion != 1", async () => {
    const body = { ...baseExportData, _meta: { ...baseExportData._meta, schemaVersion: 99 } };
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postPreview(req);
    expect(res.status).toBe(400);
  });

  it("retourne un résumé avec counts corrects", async () => {
    prismaMock.church.findMany.mockResolvedValue([{ id: "c1" }]);
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(baseExportData),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postPreview(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.counts.ministries).toBe(1);
    expect(json.counts.departments).toBe(1);
    expect(json.counts.members).toBe(1);
    expect(json.churches[0].existsInTarget).toBe(true);
  });

  it("détecte une église absente de la cible", async () => {
    prismaMock.church.findMany.mockResolvedValue([]); // aucune église dans la cible
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(baseExportData),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postPreview(req);
    const json = await res.json();
    expect(json.churches[0].existsInTarget).toBe(false);
  });
});

// ─── Import route — stratégie SKIP ───────────────────────────────────────────

describe("POST /api/admin/backups/config/import — SKIP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(superAdminSession);
    // Church exists
    prismaMock.church.findUnique.mockResolvedValue({ id: "c1" });
    prismaMock.ministry.findUnique.mockResolvedValue({ id: "m1" });
    prismaMock.department.findUnique.mockResolvedValue({ id: "d1" });
    prismaMock.member.findUnique.mockResolvedValue({ id: "mbr1" });
    prismaMock.department.findMany.mockResolvedValue([{ id: "d1" }]);
    prismaMock.memberDepartment.findMany.mockResolvedValue([]);
    prismaMock.memberDepartment.upsert.mockResolvedValue({});
    prismaMock.memberUserLink.findFirst.mockResolvedValue({ id: "link1" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1" });
    prismaMock.userChurchRole.findUnique.mockResolvedValue({ id: "role1" });
    prismaMock.$transaction.mockImplementation(
      (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
    );
  });

  it("ne modifie pas les entités existantes avec SKIP", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ data: baseExportData, strategy: "SKIP", categories: ["structure", "members", "links"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postImport(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    // Existing entities skipped, not updated
    expect(prismaMock.church.update).not.toHaveBeenCalled();
    expect(prismaMock.ministry.update).not.toHaveBeenCalled();
    expect(prismaMock.department.update).not.toHaveBeenCalled();
    expect(json.skipped).toBeGreaterThan(0);
  });

  it("crée les entités absentes avec SKIP", async () => {
    prismaMock.church.findUnique.mockResolvedValue(null);
    prismaMock.ministry.findUnique.mockResolvedValue(null);
    prismaMock.department.findUnique.mockResolvedValue(null);
    prismaMock.member.findUnique.mockResolvedValue(null);
    prismaMock.church.create.mockResolvedValue({ id: "c1" });
    prismaMock.ministry.create.mockResolvedValue({ id: "m1" });
    prismaMock.department.create.mockResolvedValue({ id: "d1" });
    prismaMock.member.create.mockResolvedValue({ id: "mbr1" });
    prismaMock.memberUserLink.findFirst.mockResolvedValue(null);
    prismaMock.memberUserLink.create.mockResolvedValue({});
    prismaMock.userChurchRole.findUnique.mockResolvedValue(null);
    prismaMock.userChurchRole.create.mockResolvedValue({ id: "role1" });

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ data: baseExportData, strategy: "SKIP", categories: ["structure", "members", "links"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postImport(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBeGreaterThan(0);
  });
});

// ─── Import route — stratégie UPDATE ─────────────────────────────────────────

describe("POST /api/admin/backups/config/import — UPDATE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(superAdminSession);
    prismaMock.church.findUnique.mockResolvedValue({ id: "c1" });
    prismaMock.ministry.findUnique.mockResolvedValue({ id: "m1" });
    prismaMock.department.findUnique.mockResolvedValue({ id: "d1" });
    prismaMock.member.findUnique.mockResolvedValue({ id: "mbr1" });
    prismaMock.department.findMany.mockResolvedValue([{ id: "d1" }]);
    prismaMock.memberDepartment.findMany.mockResolvedValue([]);
    prismaMock.memberDepartment.upsert.mockResolvedValue({});
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1" });
    prismaMock.memberUserLink.findFirst.mockResolvedValue({ id: "link1" });
    prismaMock.memberUserLink.update.mockResolvedValue({});
    prismaMock.userChurchRole.findUnique.mockResolvedValue({ id: "role1" });
    prismaMock.church.update.mockResolvedValue({});
    prismaMock.ministry.update.mockResolvedValue({});
    prismaMock.department.update.mockResolvedValue({});
    prismaMock.member.update.mockResolvedValue({});
    prismaMock.userChurchRole.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(
      (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
    );
  });

  it("met à jour les entités existantes avec UPDATE", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ data: baseExportData, strategy: "UPDATE", categories: ["structure"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postImport(req);
    expect(res.status).toBe(200);
    expect(prismaMock.church.update).toHaveBeenCalled();
    expect(prismaMock.ministry.update).toHaveBeenCalled();
    expect(prismaMock.department.update).toHaveBeenCalled();
    const json = await res.json();
    expect(json.updated).toBeGreaterThan(0);
  });
});

// ─── Import route — user email inconnu ───────────────────────────────────────

describe("POST /api/admin/backups/config/import — user inconnu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(superAdminSession);
    prismaMock.church.findUnique.mockResolvedValue({ id: "c1" });
    prismaMock.church.update.mockResolvedValue({});
    prismaMock.user.findUnique.mockResolvedValue(null); // user inconnu
    prismaMock.department.findMany.mockResolvedValue([{ id: "d1" }]);
    prismaMock.memberDepartment.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(
      (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
    );
  });

  it("skipe les liaisons avec user introuvable et ajoute un warning", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ data: baseExportData, strategy: "SKIP", categories: ["links"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postImport(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.warnings.length).toBeGreaterThan(0);
    expect(json.warnings[0]).toMatch(/introuvable/);
  });
});

// ─── Import route — 403 et validation ────────────────────────────────────────

describe("POST /api/admin/backups/config/import — erreurs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne 403 pour un non-Super Admin", async () => {
    mockRequireAuth.mockResolvedValue(regularSession);
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ data: baseExportData, strategy: "SKIP", categories: ["structure"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postImport(req);
    expect(res.status).toBe(403);
  });

  it("retourne 400 si schemaVersion != 1", async () => {
    mockRequireAuth.mockResolvedValue(superAdminSession);
    const body = {
      data: { ...baseExportData, _meta: { ...baseExportData._meta, schemaVersion: 2 } },
      strategy: "SKIP",
      categories: ["structure"],
    };
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postImport(req);
    expect(res.status).toBe(400);
  });

  it("retourne 400 si aucune catégorie", async () => {
    mockRequireAuth.mockResolvedValue(superAdminSession);
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ data: baseExportData, strategy: "SKIP", categories: [] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postImport(req);
    expect(res.status).toBe(400);
  });
});
