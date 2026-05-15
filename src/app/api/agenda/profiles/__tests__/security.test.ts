import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockRequireAgendaView = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  resolveChurchId: vi.fn().mockResolvedValue("church-1"),
}));
vi.mock("@/modules/agenda/auth", () => ({
  requireAgendaView: (...args: unknown[]) => mockRequireAgendaView(...args),
  requireAgendaManage: vi.fn(),
}));

const { GET, POST } = await import("../route");

describe("POST /api/agenda/profiles — cross-tenant userId validation (T02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.pastoralProfile.create.mockResolvedValue({ id: "prof-1", name: "Pasteur X" });
  });

  it("returns 400 when userId belongs to another church", async () => {
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);

    const req = new Request("http://localhost/api/agenda/profiles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        name: "Pasteur X",
        role: "PASTEUR",
        userId: "user-other-church",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("n'appartient pas");
  });

  it("creates profile without userId (no cross-tenant check needed)", async () => {
    const req = new Request("http://localhost/api/agenda/profiles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        name: "Pasteur X",
        role: "PASTEUR",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.userChurchRole.findFirst).not.toHaveBeenCalled();
  });

  it("creates profile with valid userId in same church", async () => {
    prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "ucr-1" });

    const req = new Request("http://localhost/api/agenda/profiles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        name: "Pasteur X",
        role: "PASTEUR",
        userId: "user-church-1",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireChurchPermission.mockRejectedValue(new Error("UNAUTHORIZED"));

    const req = new Request("http://localhost/api/agenda/profiles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        name: "Pasteur X",
        role: "PASTEUR",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when lacking church:manage", async () => {
    mockRequireChurchPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const req = new Request("http://localhost/api/agenda/profiles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        name: "Pasteur X",
        role: "PASTEUR",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when role is invalid", async () => {
    const req = new Request("http://localhost/api/agenda/profiles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        name: "Pasteur X",
        role: "INVALID_ROLE",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/agenda/profiles — requires agenda:view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAgendaView.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.pastoralProfile.findMany.mockResolvedValue([]);
  });

  it("returns profiles when authenticated with agenda:view", async () => {
    const req = new Request("http://localhost/api/agenda/profiles?churchId=church-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 400 when churchId is missing", async () => {
    const req = new Request("http://localhost/api/agenda/profiles");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAgendaView.mockRejectedValue(new Error("UNAUTHORIZED"));
    const req = new Request("http://localhost/api/agenda/profiles?churchId=church-1");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
