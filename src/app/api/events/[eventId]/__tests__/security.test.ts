import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createSuperAdminSession,
  createDepartmentHeadSession,
} from "@/__mocks__/auth";

// We need to fully mock @/lib/auth because importing the real module pulls in
// next-auth which requires Next.js server modules unavailable in Vitest.
// Provide real implementations of requireChurchPermission and resolveChurchId
// that use our mock session and mock prisma.
const mockAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => {
  // Inline implementations that mirror the real auth functions
  // but use our mockAuth instead of the NextAuth auth() call.
  async function requireAuth() {
    const session = await mockAuth();
    if (!session?.user) throw new Error("UNAUTHORIZED");
    return session;
  }

  async function requireChurchPermission(permission: string, churchId: string) {
    const session = await requireAuth();
    if (session.user.isSuperAdmin) return session;

    const roles = session.user.churchRoles.filter(
      (r: { churchId: string }) => r.churchId === churchId
    );
    if (roles.length === 0) throw new Error("FORBIDDEN");

    // Inline permission check
    const ROLE_PERMISSIONS: Record<string, string[]> = {
      SUPER_ADMIN: ["planning:view", "planning:edit", "members:view", "members:manage", "events:view", "events:manage", "departments:view", "departments:manage", "church:manage", "users:manage", "discipleship:view", "discipleship:manage", "discipleship:export", "reports:view", "reports:edit"],
      ADMIN: ["planning:view", "planning:edit", "members:view", "members:manage", "events:view", "events:manage", "departments:view", "departments:manage", "discipleship:view", "discipleship:manage", "reports:view", "reports:edit"],
      SECRETARY: ["planning:view", "members:view", "events:view", "events:manage", "departments:view", "discipleship:view", "discipleship:export", "reports:view", "reports:edit"],
      MINISTER: ["planning:view", "planning:edit", "members:view", "members:manage", "events:view", "departments:view", "departments:manage", "discipleship:view"],
      DEPARTMENT_HEAD: ["planning:view", "planning:edit", "members:view", "members:manage", "events:view", "departments:view", "discipleship:view"],
      DISCIPLE_MAKER: ["discipleship:view", "discipleship:manage"],
      REPORTER: ["events:view", "reports:view", "reports:edit"],
    };

    const userPermissions = new Set(
      roles.flatMap((r: { role: string }) => ROLE_PERMISSIONS[r.role] || [])
    );
    if (!userPermissions.has(permission)) throw new Error("FORBIDDEN");

    return session;
  }

  async function resolveChurchId(
    resourceType: string,
    resourceId: string
  ): Promise<string> {
    // Import prismaMock dynamically — it's already set up via vi.mock
    const { prisma } = await import("@/lib/prisma");

    const { ApiError } = await import("@/lib/api-utils");

    switch (resourceType) {
      case "event": {
        const event = await prisma.event.findUnique({
          where: { id: resourceId },
          select: { churchId: true },
        });
        if (!event) throw new ApiError(404, "Événement introuvable");
        return event.churchId;
      }
      default:
        throw new ApiError(400, "Type de ressource non supporté");
    }
  }

  return {
    requireAuth,
    requireChurchPermission,
    resolveChurchId,
    auth: () => mockAuth(),
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
});

const { GET, DELETE } = await import("../route");

function makeParams(eventId: string) {
  return { params: Promise.resolve({ eventId }) };
}

describe("GET /api/events/[eventId] — multi-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows admin to view event in their church", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.event.findUnique
      .mockResolvedValueOnce({ churchId: "church-1" })
      .mockResolvedValueOnce({
        id: "evt-1",
        title: "Culte",
        churchId: "church-1",
        eventDepts: [],
      });

    const request = new Request("http://localhost/api/events/evt-1");
    const res = await GET(request, makeParams("evt-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("evt-1");
  });

  it("rejects admin from church-1 viewing event in church-2", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.event.findUnique.mockResolvedValueOnce({ churchId: "church-2" });

    const request = new Request("http://localhost/api/events/evt-2");
    const res = await GET(request, makeParams("evt-2"));

    expect(res.status).toBe(403);
  });

  it("returns 404 when event does not exist", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.event.findUnique.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/events/nonexistent");
    const res = await GET(request, makeParams("nonexistent"));

    expect(res.status).toBe(404);
  });

  it("super admin can view event in any church", async () => {
    mockAuth.mockResolvedValue(createSuperAdminSession());
    prismaMock.event.findUnique
      .mockResolvedValueOnce({ churchId: "church-999" })
      .mockResolvedValueOnce({
        id: "evt-other",
        title: "Remote Event",
        churchId: "church-999",
        eventDepts: [],
      });

    const request = new Request("http://localhost/api/events/evt-other");
    const res = await GET(request, makeParams("evt-other"));

    expect(res.status).toBe(200);
  });

  it("department head cannot view event outside their church", async () => {
    mockAuth.mockResolvedValue(
      createDepartmentHeadSession(
        [{ id: "dept-1", name: "Son" }],
        "church-1"
      )
    );
    prismaMock.event.findUnique.mockResolvedValueOnce({ churchId: "church-2" });

    const request = new Request("http://localhost/api/events/evt-cross");
    const res = await GET(request, makeParams("evt-cross"));

    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    prismaMock.event.findUnique.mockResolvedValueOnce({ churchId: "church-1" });

    const request = new Request("http://localhost/api/events/evt-1");
    const res = await GET(request, makeParams("evt-1"));

    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/events/[eventId] — multi-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects admin from church-1 deleting event in church-2", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.event.findUnique.mockResolvedValueOnce({ churchId: "church-2" });

    const request = new Request("http://localhost/api/events/evt-2", {
      method: "DELETE",
    });
    const res = await DELETE(request, makeParams("evt-2"));

    expect(res.status).toBe(403);
  });

  it("allows admin to delete event in their church", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.event.findUnique
      .mockResolvedValueOnce({ churchId: "church-1" })
      .mockResolvedValueOnce({ id: "evt-1", churchId: "church-1" });

    prismaMock.eventDepartment.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockResolvedValue(undefined);

    const request = new Request("http://localhost/api/events/evt-1", {
      method: "DELETE",
    });
    const res = await DELETE(request, makeParams("evt-1"));

    expect(res.status).toBe(200);
  });
});
