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
vi.mock("@/lib/email",  () => ({
  sendEmail:       vi.fn(),
  buildJobOfferEmail: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
}));

// ─── /api/jobs ──────────────────────────────────────────────────────────────

const { GET: getJobs, POST: postJob } = await import("../route");

describe("GET /api/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
  });

  it("returns published unexpired jobs", async () => {
    prismaMock.jobOffer.findMany.mockResolvedValue([
      { id: "j1", title: "Dev", type: "EMPLOI", company: "ACME", status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date(), author: { id: "u1", name: "Alice", displayName: null, image: null } },
    ] as never);

    const res = await getJobs(new Request("http://localhost/api/jobs"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].type).toBe("EMPLOI");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    const res = await getJobs(new Request("http://localhost/api/jobs"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.jobNotificationSubscription.findMany.mockResolvedValue([]);
  });

  it("creates a job offer", async () => {
    prismaMock.jobOffer.create.mockResolvedValue({
      id: "j1", title: "Dev React", type: "STAGE", company: "Corp", status: "PUBLISHED",
      location: "Paris", description: "Desc", duration: null, deadline: null,
      contactEmail: null, contactUrl: null, authorId: "u1", createdAt: new Date(), updatedAt: new Date(),
      author: { id: "u1", name: "Alice", displayName: null, image: null },
    } as never);

    const req = new Request("http://localhost/api/jobs", {
      method: "POST",
      body: JSON.stringify({ title: "Dev React", type: "STAGE", company: "Corp", description: "Desc" }),
    });
    const res = await postJob(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Dev React");
  });

  it("returns 400 on invalid type", async () => {
    const req = new Request("http://localhost/api/jobs", {
      method: "POST",
      body: JSON.stringify({ title: "Dev", type: "INVALID", company: "Corp", description: "Desc" }),
    });
    const res = await postJob(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 when permission denied", async () => {
    mockRequirePermission.mockRejectedValue(new Error("FORBIDDEN"));
    const req = new Request("http://localhost/api/jobs", {
      method: "POST",
      body: JSON.stringify({ title: "Dev", type: "EMPLOI", company: "Corp", description: "Desc" }),
    });
    const res = await postJob(req);
    expect(res.status).toBe(403);
  });
});

// ─── /api/jobs/[id] ─────────────────────────────────────────────────────────

const { GET: getJob, PATCH: patchJob, DELETE: deleteJob } = await import("../[id]/route");

describe("GET /api/jobs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
  });

  it("returns job detail", async () => {
    prismaMock.jobOffer.findUnique.mockResolvedValue({
      id: "j1", title: "Dev", type: "EMPLOI", company: "ACME", status: "PUBLISHED",
      author: { id: "u1", name: "Alice", displayName: null, image: null },
    } as never);

    const res = await getJob(new Request("http://localhost/api/jobs/j1"), { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("j1");
  });

  it("returns 404 for unknown job", async () => {
    prismaMock.jobOffer.findUnique.mockResolvedValue(null);
    const res = await getJob(new Request("http://localhost/api/jobs/nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/jobs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
  });

  it("allows admin to update any job", async () => {
    // createAdminSession() returns user.id = "user-1" with ADMIN role
    prismaMock.jobOffer.findUnique.mockResolvedValue({ id: "j1", authorId: "someone-else" } as never);
    prismaMock.jobOffer.update.mockResolvedValue({ id: "j1", status: "ARCHIVED", author: {} } as never);

    const req = new Request("http://localhost/api/jobs/j1", {
      method: "PATCH",
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    const res = await patchJob(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 403 for non-author non-manager", async () => {
    // Override session to a regular user who doesn't own the job
    mockRequireAuth.mockResolvedValue({ user: { id: "other-user", isSuperAdmin: false, churchRoles: [{ role: "STAR" }] } });
    prismaMock.jobOffer.findUnique.mockResolvedValue({ id: "j1", authorId: "user-admin" } as never);

    const req = new Request("http://localhost/api/jobs/j1", {
      method: "PATCH",
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    const res = await patchJob(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/jobs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
  });

  it("allows author to delete", async () => {
    prismaMock.jobOffer.findUnique.mockResolvedValue({ id: "j1", authorId: "user-admin" } as never);
    prismaMock.jobOffer.delete.mockResolvedValue({} as never);

    const res = await deleteJob(new Request("http://localhost/api/jobs/j1", { method: "DELETE" }), { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 404 for unknown job", async () => {
    prismaMock.jobOffer.findUnique.mockResolvedValue(null);
    const res = await deleteJob(new Request("http://localhost/api/jobs/nope", { method: "DELETE" }), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});

// ─── /api/jobs/subscription ─────────────────────────────────────────────────

const { GET: getSub, PUT: putSub } = await import("../subscription/route");

describe("GET /api/jobs/subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
  });

  it("creates subscription if not exists and returns it", async () => {
    prismaMock.jobNotificationSubscription.upsert.mockResolvedValue({
      id: "s1", userId: "user-admin", inApp: true, email: false,
      wantEmploi: true, wantStage: true, wantAlternance: true,
    } as never);

    const res = await getSub();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inApp).toBe(true);
  });
});

describe("PUT /api/jobs/subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
  });

  it("updates subscription preferences", async () => {
    prismaMock.jobNotificationSubscription.upsert.mockResolvedValue({
      id: "s1", userId: "user-admin", inApp: false, email: true,
      wantEmploi: true, wantStage: false, wantAlternance: false,
    } as never);

    const req = new Request("http://localhost/api/jobs/subscription", {
      method: "PUT",
      body: JSON.stringify({ inApp: false, email: true, wantStage: false, wantAlternance: false }),
    });
    const res = await putSub(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe(true);
    expect(body.wantStage).toBe(false);
  });
});
