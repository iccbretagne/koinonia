import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { GET, POST } = await import("../unseen-count/route");

describe("GET /api/jobs/unseen-count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
  });

  it("uses a 30-day window on first visit (no JobLastSeen row)", async () => {
    prismaMock.jobLastSeen.findUnique.mockResolvedValue(null);
    prismaMock.jobOffer.count.mockResolvedValue(3);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(3);

    const where = prismaMock.jobOffer.count.mock.calls[0][0].where;
    expect(where.status).toBe("PUBLISHED");
    expect(where.authorId).toEqual({ not: "user-1" });
    const since = where.createdAt.gt as Date;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(since.getTime() - thirtyDaysAgo)).toBeLessThan(5000);
  });

  it("uses the stored seenAt when a JobLastSeen row exists", async () => {
    const seenAt = new Date("2026-09-01T00:00:00.000Z");
    prismaMock.jobLastSeen.findUnique.mockResolvedValue({ seenAt } as never);
    prismaMock.jobOffer.count.mockResolvedValue(1);

    const res = await GET();
    expect(res.status).toBe(200);

    const where = prismaMock.jobOffer.count.mock.calls[0][0].where;
    expect(where.createdAt.gt).toBe(seenAt);
  });

  it("excludes the current user's own offers via authorId filter", async () => {
    prismaMock.jobLastSeen.findUnique.mockResolvedValue(null);
    prismaMock.jobOffer.count.mockResolvedValue(0);

    await GET();

    const where = prismaMock.jobOffer.count.mock.calls[0][0].where;
    expect(where.authorId).toEqual({ not: "user-1" });
  });

  it("only counts PUBLISHED offers (ARCHIVED excluded by the status filter)", async () => {
    prismaMock.jobLastSeen.findUnique.mockResolvedValue(null);
    prismaMock.jobOffer.count.mockResolvedValue(0);

    await GET();

    const where = prismaMock.jobOffer.count.mock.calls[0][0].where;
    expect(where.status).toBe("PUBLISHED");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/jobs/unseen-count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
  });

  it("upserts the JobLastSeen row for the current user", async () => {
    prismaMock.jobLastSeen.upsert.mockResolvedValue({ userId: "user-1", seenAt: new Date() } as never);

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const call = prismaMock.jobLastSeen.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId: "user-1" });
  });

  it("returns 0 on a subsequent GET after POST resets seenAt", async () => {
    const now = new Date();
    prismaMock.jobLastSeen.upsert.mockResolvedValue({ userId: "user-1", seenAt: now } as never);
    await POST();

    prismaMock.jobLastSeen.findUnique.mockResolvedValue({ seenAt: now } as never);
    prismaMock.jobOffer.count.mockResolvedValue(0);

    const res = await GET();
    const body = await res.json();
    expect(body.count).toBe(0);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    const res = await POST();
    expect(res.status).toBe(401);
  });
});
