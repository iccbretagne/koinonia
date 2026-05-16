import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireAgendaView = vi.fn();
const mockRequireAgendaManage = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth", () => ({
  resolveChurchId: vi.fn().mockResolvedValue("church-1"),
  requireChurchPermission: vi.fn(),
}));
vi.mock("@/modules/agenda/auth", () => ({
  requireAgendaView: (...args: unknown[]) => mockRequireAgendaView(...args),
  requireAgendaManage: (...args: unknown[]) => mockRequireAgendaManage(...args),
}));

const { GET, POST } = await import("../route");

const validEntry = {
  churchId: "church-1",
  recipientId: "prof-1",
  type: "ACTIVITY",
  title: "Réunion",
  startsAt: "2026-06-01T10:00:00.000Z",
  endsAt: "2026-06-01T11:00:00.000Z",
};

describe("POST /api/agenda/entries — temporal validation (T04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAgendaManage.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.pastoralProfile.findFirst.mockResolvedValue({ id: "prof-1" });
    prismaMock.agendaEntry.create.mockResolvedValue({ id: "entry-1", ...validEntry });
  });

  it("returns 400 when endsAt is before startsAt", async () => {
    const req = new Request("http://localhost/api/agenda/entries", {
      method: "POST",
      body: JSON.stringify({
        ...validEntry,
        startsAt: "2026-06-01T11:00:00.000Z",
        endsAt: "2026-06-01T10:00:00.000Z",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    // ZodError wraps details in body.details
    const hasFinError =
      (body.error && body.error.includes("fin")) ||
      (body.details && body.details.some((d: { message: string }) => d.message.includes("fin")));
    expect(hasFinError).toBe(true);
  });

  it("returns 400 when endsAt equals startsAt", async () => {
    const req = new Request("http://localhost/api/agenda/entries", {
      method: "POST",
      body: JSON.stringify({
        ...validEntry,
        startsAt: "2026-06-01T10:00:00.000Z",
        endsAt: "2026-06-01T10:00:00.000Z",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates entry when endsAt > startsAt", async () => {
    const req = new Request("http://localhost/api/agenda/entries", {
      method: "POST",
      body: JSON.stringify(validEntry),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("creates entry without endsAt", async () => {
    const { endsAt: _endsAt, ...withoutEnd } = validEntry;
    const req = new Request("http://localhost/api/agenda/entries", {
      method: "POST",
      body: JSON.stringify(withoutEnd),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("returns 400 when profile is not in the church (cross-tenant)", async () => {
    prismaMock.pastoralProfile.findFirst.mockResolvedValue(null);

    const req = new Request("http://localhost/api/agenda/entries", {
      method: "POST",
      body: JSON.stringify({ ...validEntry, recipientId: "prof-other-church" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("périmètre");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAgendaManage.mockRejectedValue(new Error("UNAUTHORIZED"));
    const req = new Request("http://localhost/api/agenda/entries", {
      method: "POST",
      body: JSON.stringify(validEntry),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when lacking agenda:manage", async () => {
    mockRequireAgendaManage.mockRejectedValue(new Error("FORBIDDEN"));
    const req = new Request("http://localhost/api/agenda/entries", {
      method: "POST",
      body: JSON.stringify(validEntry),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/agenda/entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAgendaView.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.agendaEntry.findMany.mockResolvedValue([]);
  });

  it("returns entries for the church", async () => {
    const req = new Request(
      "http://localhost/api/agenda/entries?churchId=church-1"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 400 when churchId is missing", async () => {
    const req = new Request("http://localhost/api/agenda/entries");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAgendaView.mockRejectedValue(new Error("UNAUTHORIZED"));
    const req = new Request(
      "http://localhost/api/agenda/entries?churchId=church-1"
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
