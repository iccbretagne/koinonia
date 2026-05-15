import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createAgendaQualifierSession,
  createProtocoleMemberSession,
} from "@/__mocks__/auth";

const mockAuth = vi.fn();
const mockRequireChurchPermission = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: vi.fn(),
  RATE_LIMIT_MUTATION: {},
}));
vi.mock("next-auth", () => ({
  default: () => ({
    auth: mockAuth,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...original,
    auth: () => mockAuth(),
    requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  };
});
vi.mock("@/modules/agenda/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/agenda/auth")>();
  return { ...original };
});

const { GET, POST } = await import("../route");

describe("GET /api/agenda/requests — status enum validation (T01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.appointmentRequest.findMany.mockResolvedValue([]);
    prismaMock.department.count.mockResolvedValue(0);
  });

  it("returns 400 for invalid status SCHEDULED", async () => {
    const req = new Request(
      "http://localhost/api/agenda/requests?churchId=church-1&status=SCHEDULED"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Statut invalide");
  });

  it("returns 400 for invalid status REJECTED", async () => {
    const req = new Request(
      "http://localhost/api/agenda/requests?churchId=church-1&status=REJECTED"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for arbitrary status string", async () => {
    const req = new Request(
      "http://localhost/api/agenda/requests?churchId=church-1&status=ALL"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("accepts status=PENDING for qualifier", async () => {
    mockAuth.mockResolvedValue(createAgendaQualifierSession("church-1"));
    prismaMock.department.count.mockResolvedValue(0);
    const req = new Request(
      "http://localhost/api/agenda/requests?churchId=church-1&status=PENDING"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 403 when qualifier requests status=VALIDATED", async () => {
    mockAuth.mockResolvedValue(createAgendaQualifierSession("church-1"));
    prismaMock.department.count.mockResolvedValue(0);
    const req = new Request(
      "http://localhost/api/agenda/requests?churchId=church-1&status=VALIDATED"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when churchId is missing", async () => {
    const req = new Request("http://localhost/api/agenda/requests");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("allows admin to see both PENDING and VALIDATED without status filter", async () => {
    const req = new Request(
      "http://localhost/api/agenda/requests?churchId=church-1"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(prismaMock.appointmentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: expect.arrayContaining(["PENDING", "VALIDATED"]) },
        }),
      })
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request(
      "http://localhost/api/agenda/requests?churchId=church-1"
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/agenda/requests — auth and validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.appointmentRequest.create.mockResolvedValue({ id: "req-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireChurchPermission.mockRejectedValue(new Error("UNAUTHORIZED"));
    const req = new Request("http://localhost/api/agenda/requests", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        firstName: "Jean",
        lastName: "Dupont",
        subject: "RDV pastoral",
        message: "Besoin d'un entretien",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const req = new Request("http://localhost/api/agenda/requests", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates the request successfully", async () => {
    const req = new Request("http://localhost/api/agenda/requests", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        firstName: "Jean",
        lastName: "Dupont",
        subject: "RDV pastoral",
        message: "Besoin d'un entretien",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});

describe("GET /api/agenda/requests — PROTOCOLE member access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PROTOCOLE member can see VALIDATED requests", async () => {
    const session = createProtocoleMemberSession("dept-protocole", "church-1");
    mockAuth.mockResolvedValue(session);
    prismaMock.department.count.mockResolvedValue(1);
    prismaMock.appointmentRequest.findMany.mockResolvedValue([]);

    const req = new Request(
      "http://localhost/api/agenda/requests?churchId=church-1&status=VALIDATED"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("PROTOCOLE member cannot see PENDING requests (only qualifiers can)", async () => {
    const session = createProtocoleMemberSession("dept-protocole", "church-1");
    mockAuth.mockResolvedValue(session);
    prismaMock.department.count.mockResolvedValue(1);

    const req = new Request(
      "http://localhost/api/agenda/requests?churchId=church-1&status=PENDING"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
