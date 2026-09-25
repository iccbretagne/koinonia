import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createSecretarySession,
  createPastoralCareReferentSession,
  createMinisterSession,
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

const { GET, POST } = await import("../route");

describe("GET /api/care/requests — validation et accès", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.appointmentRequest.findMany.mockResolvedValue([]);
    prismaMock.pastoralProfile.findMany.mockResolvedValue([]);
  });

  it("returns 400 for an invalid status", async () => {
    const req = new Request("http://localhost/api/care/requests?churchId=church-1&status=ALL");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when churchId is missing", async () => {
    const req = new Request("http://localhost/api/care/requests");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request("http://localhost/api/care/requests?churchId=church-1");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("Admin (canOverview) voit toutes les demandes, tous statuts confondus", async () => {
    const req = new Request("http://localhost/api/care/requests?churchId=church-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(prismaMock.appointmentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ churchId: "church-1" }),
      })
    );
  });

  it("Référent soins pastoraux (care:qualify) accède à la liste", async () => {
    mockAuth.mockResolvedValue(createPastoralCareReferentSession("church-1"));
    const req = new Request("http://localhost/api/care/requests?churchId=church-1&status=PENDING");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("Secrétaire (care:view) accède à la liste mais le contenu sera masqué (T32)", async () => {
    mockAuth.mockResolvedValue(createSecretarySession("church-1"));
    prismaMock.appointmentRequest.findMany.mockResolvedValue([
      {
        id: "req-1",
        firstName: "Jean",
        lastName: "Dupont",
        subject: "Oppressions",
        message: "confidentiel",
        status: "PENDING",
        assignedTo: null,
      },
    ] as never);
    const req = new Request("http://localhost/api/care/requests?churchId=church-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].masked).toBe(true);
    expect(body[0].subject).not.toBe("Oppressions");
  });

  it("un Ministre sans droit ni profil pastoral rattaché est refusé (#583)", async () => {
    mockAuth.mockResolvedValue(createMinisterSession("ministry-1", "church-1"));
    const req = new Request("http://localhost/api/care/requests?churchId=church-1");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/care/requests — dépôt connecté", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.appointmentRequest.create.mockResolvedValue({ id: "req-1" });
    prismaMock.church.findUnique.mockResolvedValue({ name: "ICC Rennes" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireChurchPermission.mockRejectedValue(new Error("UNAUTHORIZED"));
    const req = new Request("http://localhost/api/care/requests", {
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
    const req = new Request("http://localhost/api/care/requests", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates the request successfully, sans jour préféré", async () => {
    const req = new Request("http://localhost/api/care/requests", {
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
    const createCall = prismaMock.appointmentRequest.create.mock.calls.at(-1)?.[0];
    expect(createCall.data.preferredDays).toBeUndefined();
  });
});
