import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireAuth       = vi.fn();
const mockRequirePermission = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireAuth:       (...args: unknown[]) => mockRequireAuth(...args),
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// ─── /api/jobs/seekers ──────────────────────────────────────────────────────

const { GET: getSeekers, POST: postSeeker } = await import("../seekers/route");

const baseSeeker = {
  id: "s1", title: "Dev React cherche CDI",
  wantEmploi: true, wantStage: false, wantAlternance: false,
  sector: "Informatique", location: "Paris", remote: false,
  availableFrom: null, description: "5 ans d'expérience React",
  contactEmail: "dev@example.com", contactUrl: null,
  status: "ACTIVE", authorId: "user-admin",
  createdAt: new Date(), updatedAt: new Date(),
  author: { id: "user-admin", name: "Alice", displayName: null, image: null },
};

describe("GET /api/jobs/seekers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
  });

  it("returns active seekers", async () => {
    prismaMock.jobSeeker.findMany.mockResolvedValue([baseSeeker] as never);

    const res = await getSeekers(new Request("http://localhost/api/jobs/seekers"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Dev React cherche CDI");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    const res = await getSeekers(new Request("http://localhost/api/jobs/seekers"));
    expect(res.status).toBe(401);
  });

  it("filters by type — only wantEmploi seekers", async () => {
    prismaMock.jobSeeker.findMany.mockResolvedValue([baseSeeker] as never);

    const res = await getSeekers(new Request("http://localhost/api/jobs/seekers?type=EMPLOI"));
    expect(res.status).toBe(200);
    expect(prismaMock.jobSeeker.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ wantEmploi: true }),
      })
    );
  });
});

describe("POST /api/jobs/seekers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.jobNotificationSubscription.findMany.mockResolvedValue([]);
  });

  it("creates a seeker profile", async () => {
    prismaMock.jobSeeker.create.mockResolvedValue(baseSeeker as never);

    const req = new Request("http://localhost/api/jobs/seekers", {
      method: "POST",
      body: JSON.stringify({
        title: "Dev React cherche CDI",
        wantEmploi: true,
        description: "5 ans d'expérience React",
      }),
    });
    const res = await postSeeker(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Dev React cherche CDI");
  });

  it("returns 400 when no contract type selected", async () => {
    const req = new Request("http://localhost/api/jobs/seekers", {
      method: "POST",
      body: JSON.stringify({
        title: "Cherche emploi",
        wantEmploi: false,
        wantStage: false,
        wantAlternance: false,
        description: "Présentation",
      }),
    });
    const res = await postSeeker(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));
    const req = new Request("http://localhost/api/jobs/seekers", {
      method: "POST",
      body: JSON.stringify({ title: "Dev", wantEmploi: true, description: "Desc" }),
    });
    const res = await postSeeker(req);
    expect(res.status).toBe(401);
  });
});

// ─── /api/jobs/seekers/[id] ─────────────────────────────────────────────────

const { PATCH: patchSeeker, DELETE: deleteSeeker } = await import("../seekers/[id]/route");

describe("PATCH /api/jobs/seekers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows author to set status FOUND", async () => {
    mockRequireAuth.mockResolvedValue({ user: { id: "author-1", isSuperAdmin: false, churchRoles: [{ role: "STAR" }] } });
    prismaMock.jobSeeker.findUnique.mockResolvedValue({ id: "s1", authorId: "author-1", status: "ACTIVE" } as never);
    prismaMock.jobSeeker.update.mockResolvedValue({ ...baseSeeker, status: "FOUND", author: {} } as never);

    const req = new Request("http://localhost/api/jobs/seekers/s1", {
      method: "PATCH",
      body: JSON.stringify({ status: "FOUND" }),
    });
    const res = await patchSeeker(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 403 when author tries to set status ARCHIVED", async () => {
    mockRequireAuth.mockResolvedValue({ user: { id: "author-1", isSuperAdmin: false, churchRoles: [{ role: "STAR" }] } });
    prismaMock.jobSeeker.findUnique.mockResolvedValue({ id: "s1", authorId: "author-1", status: "ACTIVE" } as never);

    const req = new Request("http://localhost/api/jobs/seekers/s1", {
      method: "PATCH",
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    const res = await patchSeeker(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 for third-party user", async () => {
    mockRequireAuth.mockResolvedValue({ user: { id: "other-user", isSuperAdmin: false, churchRoles: [{ role: "STAR" }] } });
    prismaMock.jobSeeker.findUnique.mockResolvedValue({ id: "s1", authorId: "author-1", status: "ACTIVE" } as never);

    const req = new Request("http://localhost/api/jobs/seekers/s1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Nouveau titre" }),
    });
    const res = await patchSeeker(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(403);
  });

  it("allows admin to archive", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession());
    prismaMock.jobSeeker.findUnique.mockResolvedValue({ id: "s1", authorId: "author-1", status: "ACTIVE" } as never);
    prismaMock.jobSeeker.update.mockResolvedValue({ ...baseSeeker, status: "ARCHIVED", author: {} } as never);

    const req = new Request("http://localhost/api/jobs/seekers/s1", {
      method: "PATCH",
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    const res = await patchSeeker(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/jobs/seekers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows author to delete", async () => {
    mockRequireAuth.mockResolvedValue({ user: { id: "author-1", isSuperAdmin: false, churchRoles: [{ role: "STAR" }] } });
    prismaMock.jobSeeker.findUnique.mockResolvedValue({ id: "s1", authorId: "author-1" } as never);
    prismaMock.jobSeeker.delete.mockResolvedValue({} as never);

    const res = await deleteSeeker(
      new Request("http://localhost/api/jobs/seekers/s1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 403 for third-party user", async () => {
    mockRequireAuth.mockResolvedValue({ user: { id: "other-user", isSuperAdmin: false, churchRoles: [{ role: "STAR" }] } });
    prismaMock.jobSeeker.findUnique.mockResolvedValue({ id: "s1", authorId: "author-1" } as never);

    const res = await deleteSeeker(
      new Request("http://localhost/api/jobs/seekers/s1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(403);
  });
});
