import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createSession } from "@/__mocks__/auth";

const mockRequireAuth       = vi.fn();
const mockRequirePermission = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireAuth:       (...args: unknown[]) => mockRequireAuth(...args),
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// ─── /api/jobs/freelance/missions ────────────────────────────────────────────

const { GET: getMissions, POST: postMission } = await import("../freelance/missions/route");
const { PATCH: patchMission, DELETE: deleteMission } =
  await import("../freelance/missions/[id]/route");

// ─── /api/jobs/freelance/profiles ────────────────────────────────────────────

const { POST: postProfile } = await import("../freelance/profiles/route");
const { PATCH: patchProfile, DELETE: deleteProfile } =
  await import("../freelance/profiles/[id]/route");

const adminSession = createAdminSession();
const userSession  = createSession({
  id: "user-regular",
  churchRoles: [{ id: "r1", churchId: "c1", role: "STAR", ministryId: null,
    church: { id: "c1", name: "T", slug: "t" }, departments: [] }],
});
const otherSession = createSession({
  id: "user-other",
  churchRoles: [{ id: "r2", churchId: "c1", role: "STAR", ministryId: null,
    church: { id: "c1", name: "T", slug: "t" }, departments: [] }],
});

const baseMission = {
  id: "m1", title: "Dev React 3 mois", domain: "Développement web",
  duration: "3 mois", dailyRate: "400€", hourlyRate: null,
  modality: "REMOTE", location: null,
  description: "Mission React/Next.js pour refonte frontend",
  contactEmail: "contact@example.com", contactUrl: null,
  status: "ACTIVE", authorId: "user-regular",
  createdAt: new Date(), updatedAt: new Date(),
  author: { id: "user-regular", name: "Bob", displayName: null, image: null },
};

const baseProfile = {
  id: "p1", title: "Graphiste freelance disponible", domain: "Design",
  dailyRate: null, hourlyRate: "50€",
  modality: "HYBRID", location: "Lyon",
  availableFrom: null,
  description: "5 ans d'expérience en identité visuelle",
  contactEmail: "designer@example.com", contactUrl: null,
  status: "ACTIVE", authorId: "user-regular",
  createdAt: new Date(), updatedAt: new Date(),
  author: { id: "user-regular", name: "Bob", displayName: null, image: null },
};

// ─── Missions — GET list ──────────────────────────────────────────────────────

describe("GET /api/jobs/freelance/missions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(userSession);
  });

  it("returns active missions list", async () => {
    prismaMock.freelanceMission.findMany.mockResolvedValue([baseMission] as never);

    const res = await getMissions();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Dev React 3 mois");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    const res = await getMissions();
    expect(res.status).toBe(401);
  });
});

// ─── Missions — POST ─────────────────────────────────────────────────────────

describe("POST /api/jobs/freelance/missions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(userSession);
    prismaMock.jobNotificationSubscription.findMany.mockResolvedValue([]);
  });

  it("creates a mission and returns 201", async () => {
    prismaMock.freelanceMission.create.mockResolvedValue(baseMission as never);

    const req = new Request("http://localhost/api/jobs/freelance/missions", {
      method: "POST",
      body: JSON.stringify({
        title: "Dev React 3 mois",
        domain: "Développement web",
        description: "Mission React/Next.js",
        modality: "REMOTE",
      }),
    });

    const res = await postMission(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Dev React 3 mois");
  });

  it("returns 400 when domain is missing", async () => {
    const req = new Request("http://localhost/api/jobs/freelance/missions", {
      method: "POST",
      body: JSON.stringify({ title: "Mission sans domaine", description: "desc" }),
    });

    const res = await postMission(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));
    const req = new Request("http://localhost/api/jobs/freelance/missions", {
      method: "POST",
      body: JSON.stringify({ title: "t", domain: "d", description: "desc" }),
    });
    const res = await postMission(req);
    expect(res.status).toBe(401);
  });
});

// ─── Missions — PATCH ────────────────────────────────────────────────────────

describe("PATCH /api/jobs/freelance/missions/[id]", () => {
  const params = Promise.resolve({ id: "m1" });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.freelanceMission.findUnique.mockResolvedValue(
      { id: "m1", authorId: "user-regular", status: "ACTIVE" } as never
    );
  });

  it("author can mark mission as FILLED", async () => {
    mockRequireAuth.mockResolvedValue(userSession);
    prismaMock.freelanceMission.update.mockResolvedValue({ ...baseMission, status: "FILLED" } as never);

    const req = new Request("http://localhost/api/jobs/freelance/missions/m1", {
      method: "PATCH",
      body: JSON.stringify({ status: "FILLED" }),
    });

    const res = await patchMission(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("FILLED");
  });

  it("author cannot set ARCHIVED — 403", async () => {
    mockRequireAuth.mockResolvedValue(userSession);

    const req = new Request("http://localhost/api/jobs/freelance/missions/m1", {
      method: "PATCH",
      body: JSON.stringify({ status: "ARCHIVED" }),
    });

    const res = await patchMission(req, { params });
    expect(res.status).toBe(403);
  });

  it("third party gets 403", async () => {
    mockRequireAuth.mockResolvedValue(otherSession);

    const req = new Request("http://localhost/api/jobs/freelance/missions/m1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Hack" }),
    });

    const res = await patchMission(req, { params });
    expect(res.status).toBe(403);
  });
});

// ─── Missions — DELETE ───────────────────────────────────────────────────────

describe("DELETE /api/jobs/freelance/missions/[id]", () => {
  const params = Promise.resolve({ id: "m1" });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.freelanceMission.findUnique.mockResolvedValue(
      { id: "m1", authorId: "user-regular" } as never
    );
  });

  it("author can delete their mission", async () => {
    mockRequireAuth.mockResolvedValue(userSession);
    prismaMock.freelanceMission.delete.mockResolvedValue(baseMission as never);

    const res = await deleteMission(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
  });

  it("third party gets 403", async () => {
    mockRequireAuth.mockResolvedValue(otherSession);

    const res = await deleteMission(new Request("http://localhost"), { params });
    expect(res.status).toBe(403);
  });
});

// ─── Profiles — POST ─────────────────────────────────────────────────────────

describe("POST /api/jobs/freelance/profiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(userSession);
    prismaMock.jobNotificationSubscription.findMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));
    const req = new Request("http://localhost/api/jobs/freelance/profiles", {
      method: "POST",
      body: JSON.stringify({ title: "t", domain: "d", description: "desc" }),
    });
    const res = await postProfile(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when domain is missing", async () => {
    const req = new Request("http://localhost/api/jobs/freelance/profiles", {
      method: "POST",
      body: JSON.stringify({ title: "Profil sans domaine", description: "desc" }),
    });
    const res = await postProfile(req);
    expect(res.status).toBe(400);
  });

  it("creates a profile and returns 201", async () => {
    prismaMock.freelanceProfile.create.mockResolvedValue(baseProfile as never);

    const req = new Request("http://localhost/api/jobs/freelance/profiles", {
      method: "POST",
      body: JSON.stringify({
        title: "Graphiste freelance disponible",
        domain: "Design",
        description: "5 ans d'expérience",
        modality: "HYBRID",
      }),
    });

    const res = await postProfile(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.domain).toBe("Design");
  });
});

// ─── Profiles — PATCH ────────────────────────────────────────────────────────

describe("PATCH /api/jobs/freelance/profiles/[id]", () => {
  const params = Promise.resolve({ id: "p1" });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.freelanceProfile.findUnique.mockResolvedValue(
      { id: "p1", authorId: "user-regular", status: "ACTIVE" } as never
    );
  });

  it("author can mark profile as UNAVAILABLE", async () => {
    mockRequireAuth.mockResolvedValue(userSession);
    prismaMock.freelanceProfile.update.mockResolvedValue({ ...baseProfile, status: "UNAVAILABLE" } as never);

    const req = new Request("http://localhost/api/jobs/freelance/profiles/p1", {
      method: "PATCH",
      body: JSON.stringify({ status: "UNAVAILABLE" }),
    });

    const res = await patchProfile(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("UNAVAILABLE");
  });

  it("author cannot set ARCHIVED — 403", async () => {
    mockRequireAuth.mockResolvedValue(userSession);

    const req = new Request("http://localhost/api/jobs/freelance/profiles/p1", {
      method: "PATCH",
      body: JSON.stringify({ status: "ARCHIVED" }),
    });

    const res = await patchProfile(req, { params });
    expect(res.status).toBe(403);
  });
});

// ─── Profiles — DELETE ───────────────────────────────────────────────────────

describe("DELETE /api/jobs/freelance/profiles/[id]", () => {
  const params = Promise.resolve({ id: "p1" });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.freelanceProfile.findUnique.mockResolvedValue(
      { id: "p1", authorId: "user-regular" } as never
    );
  });

  it("admin can delete any profile", async () => {
    mockRequireAuth.mockResolvedValue(adminSession);
    prismaMock.freelanceProfile.delete.mockResolvedValue(baseProfile as never);

    const res = await deleteProfile(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
  });
});
