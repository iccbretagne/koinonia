import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createDepartmentHeadSession,
} from "@/__mocks__/auth";

const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) =>
    mockRequirePermission(...args),
  resolveChurchId: vi.fn().mockResolvedValue("church-1"),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: vi.fn(),
  RATE_LIMIT_MUTATION: {},
}));
vi.mock("@/lib/department-functions", () => ({
  DEPT_FN: {
    SECRETARIAT: "SECRETARIAT",
    COMMUNICATION: "COMMUNICATION",
    PRODUCTION_MEDIA: "PRODUCTION_MEDIA",
  },
}));

const { POST } = await import("../route");
const { PATCH } = await import("../../announcements/[id]/route");

const basePostBody = {
  churchId: "church-1",
  title: "Test announcement",
  content: "Test content",
  channelInterne: true,
  channelExterne: false,
  targetEventIds: [],
};

describe("POST /api/announcements — cross-tenant validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    // Default: department.findFirst returns a valid dept (same church)
    prismaMock.department.findFirst.mockResolvedValue({ id: "dept-1" });
    // Default: ministry.findFirst returns a valid ministry (same church)
    prismaMock.ministry.findFirst.mockResolvedValue({ id: "min-1" });
    // Default: event.count returns matching count
    prismaMock.event.count.mockResolvedValue(0);
    // Default: $transaction resolves with created announcement
    prismaMock.announcement.create.mockResolvedValue({ id: "ann-new" });
    prismaMock.request.create.mockResolvedValue({ id: "req-1" });
  });

  it("returns 400 when departmentId belongs to another church", async () => {
    prismaMock.department.findFirst.mockResolvedValue(null);

    const request = new Request("http://localhost/api/announcements", {
      method: "POST",
      body: JSON.stringify({
        ...basePostBody,
        departmentId: "dept-other-church",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("périmètre");
  });

  it("returns 400 when ministryId belongs to another church", async () => {
    prismaMock.ministry.findFirst.mockResolvedValue(null);

    const request = new Request("http://localhost/api/announcements", {
      method: "POST",
      body: JSON.stringify({
        ...basePostBody,
        ministryId: "min-other-church",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("périmètre");
  });

  it("returns 400 when targetEventIds contain events from another church", async () => {
    prismaMock.event.count.mockResolvedValue(0);

    const request = new Request("http://localhost/api/announcements", {
      method: "POST",
      body: JSON.stringify({
        ...basePostBody,
        targetEventIds: ["event-other-church"],
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("périmètre");
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));

    const request = new Request("http://localhost/api/announcements", {
      method: "POST",
      body: JSON.stringify(basePostBody),
    });
    const res = await POST(request);

    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/announcements/[id] — authorization & validation", () => {
  const params = Promise.resolve({ id: "ann-1" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({
      id: "ann-1",
      submittedById: "user-1",
      churchId: "church-1",
    });
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));

    const request = new Request("http://localhost/api/announcements/ann-1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated" }),
    });
    const res = await PATCH(request, { params });

    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not owner and not manager", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({
      id: "ann-1",
      submittedById: "other-user",
      churchId: "church-1",
    });
    // Department head has planning:view but not events:manage, and is not the owner
    mockRequirePermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-1", name: "Test Dept" }])
    );

    const request = new Request("http://localhost/api/announcements/ann-1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated" }),
    });
    const res = await PATCH(request, { params });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Accès refusé");
  });

  it("returns 400 when targetEventIds contain events from another church", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({
      id: "ann-1",
      submittedById: "user-1",
      churchId: "church-1",
    });
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.event.count.mockResolvedValue(0);

    const request = new Request("http://localhost/api/announcements/ann-1", {
      method: "PATCH",
      body: JSON.stringify({ targetEventIds: ["event-other-church"] }),
    });
    const res = await PATCH(request, { params });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("périmètre");
  });
});
