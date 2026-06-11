import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequirePermission = vi.fn();
const mockGetCurrentChurchId = vi.fn().mockResolvedValue("church-1");
vi.mock("@/lib/auth", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  getCurrentChurchId: (...args: unknown[]) => mockGetCurrentChurchId(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// ─── Families pool ─────────────────────────────────────────────────────────

const { GET: getFamilies, POST: postFamily } = await import("../families/route");
const { PATCH: patchFamily, DELETE: deleteFamily } = await import("../families/[id]/route");

describe("GET /api/welcome-duty/families", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("returns pool families", async () => {
    prismaMock.welcomeDutyFamily.findMany.mockResolvedValue([
      { id: "f1", churchId: "church-1", familyId: 1, familyName: "Famille A", active: true, createdAt: new Date(), assignments: [] },
    ]);

    const res = await getFamilies(new Request("http://localhost/api/welcome-duty/families"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].familyName).toBe("Famille A");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));
    const res = await getFamilies(new Request("http://localhost/api/welcome-duty/families"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/welcome-duty/families", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("creates a new family in pool", async () => {
    prismaMock.welcomeDutyFamily.findUnique.mockResolvedValue(null);
    prismaMock.welcomeDutyFamily.create.mockResolvedValue({
      id: "f1", churchId: "church-1", familyId: 3, familyName: "Famille C", active: true, createdAt: new Date(),
    });

    const req = new Request("http://localhost/api/welcome-duty/families", {
      method: "POST",
      body: JSON.stringify({ familyId: 3, familyName: "Famille C" }),
    });
    const res = await postFamily(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.familyName).toBe("Famille C");
  });

  it("returns 409 when family already active in pool", async () => {
    prismaMock.welcomeDutyFamily.findUnique.mockResolvedValue({
      id: "f1", churchId: "church-1", familyId: 3, familyName: "Famille C", active: true, createdAt: new Date(),
    });

    const req = new Request("http://localhost/api/welcome-duty/families", {
      method: "POST",
      body: JSON.stringify({ familyId: 3, familyName: "Famille C" }),
    });
    const res = await postFamily(req);
    expect(res.status).toBe(409);
  });

  it("reactivates an inactive family", async () => {
    prismaMock.welcomeDutyFamily.findUnique.mockResolvedValue({
      id: "f1", churchId: "church-1", familyId: 3, familyName: "Famille C", active: false, createdAt: new Date(),
    });
    prismaMock.welcomeDutyFamily.update.mockResolvedValue({
      id: "f1", churchId: "church-1", familyId: 3, familyName: "Famille C", active: true, createdAt: new Date(),
    });

    const req = new Request("http://localhost/api/welcome-duty/families", {
      method: "POST",
      body: JSON.stringify({ familyId: 3, familyName: "Famille C" }),
    });
    const res = await postFamily(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(true);
  });
});

describe("PATCH /api/welcome-duty/families/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("toggles active status", async () => {
    prismaMock.welcomeDutyFamily.findFirst.mockResolvedValue({
      id: "f1", churchId: "church-1", familyId: 1, familyName: "Famille A", active: true, createdAt: new Date(),
    });
    prismaMock.welcomeDutyFamily.update.mockResolvedValue({
      id: "f1", churchId: "church-1", familyId: 1, familyName: "Famille A", active: false, createdAt: new Date(),
    });

    const req = new Request("http://localhost/api/welcome-duty/families/f1", {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    const res = await patchFamily(req, { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(false);
  });

  it("returns 404 for unknown family", async () => {
    prismaMock.welcomeDutyFamily.findFirst.mockResolvedValue(null);
    const req = new Request("http://localhost/api/welcome-duty/families/nope", {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    const res = await patchFamily(req, { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/welcome-duty/families/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("deletes a family from pool", async () => {
    prismaMock.welcomeDutyFamily.findFirst.mockResolvedValue({
      id: "f1", churchId: "church-1", familyId: 1, familyName: "Famille A", active: true, createdAt: new Date(),
    });
    prismaMock.welcomeDutyFamily.delete.mockResolvedValue({} as never);

    const res = await deleteFamily(new Request("http://localhost/api/welcome-duty/families/f1", { method: "DELETE" }), { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ─── Assignments ───────────────────────────────────────────────────────────

const { GET: getAssignments, POST: postAssignment } = await import("../assignments/route");
const { DELETE: deleteAssignment } = await import("../assignments/[id]/route");

describe("GET /api/welcome-duty/assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("returns assignments for an event", async () => {
    prismaMock.welcomeDutyAssignment.findMany.mockResolvedValue([
      { id: "a1", churchId: "church-1", eventId: "evt-1", welcomeDutyFamilyId: "f1", note: null, createdAt: new Date(), welcomeDutyFamily: { id: "f1", familyName: "Famille A" } },
    ]);

    const res = await getAssignments(new Request("http://localhost/api/welcome-duty/assignments?eventId=evt-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("returns 400 when neither eventId nor from provided", async () => {
    const res = await getAssignments(new Request("http://localhost/api/welcome-duty/assignments"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/welcome-duty/assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("creates an assignment", async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: "evt-1", churchId: "church-1" } as never);
    prismaMock.welcomeDutyFamily.findFirst.mockResolvedValue({ id: "f1", churchId: "church-1", active: true } as never);
    prismaMock.welcomeDutyAssignment.create.mockResolvedValue({
      id: "a1", churchId: "church-1", eventId: "evt-1", welcomeDutyFamilyId: "f1", note: null, createdAt: new Date(),
      welcomeDutyFamily: { id: "f1", familyName: "Famille A" },
    });

    const req = new Request("http://localhost/api/welcome-duty/assignments", {
      method: "POST",
      body: JSON.stringify({ eventId: "evt-1", welcomeDutyFamilyId: "f1" }),
    });
    const res = await postAssignment(req);
    expect(res.status).toBe(201);
  });

  it("returns 404 when event not found", async () => {
    prismaMock.event.findFirst.mockResolvedValue(null);
    const req = new Request("http://localhost/api/welcome-duty/assignments", {
      method: "POST",
      body: JSON.stringify({ eventId: "bad", welcomeDutyFamilyId: "f1" }),
    });
    const res = await postAssignment(req);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/welcome-duty/assignments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("deletes an assignment", async () => {
    prismaMock.welcomeDutyAssignment.findFirst.mockResolvedValue({ id: "a1", churchId: "church-1" } as never);
    prismaMock.welcomeDutyAssignment.delete.mockResolvedValue({} as never);

    const res = await deleteAssignment(new Request("http://localhost/api/welcome-duty/assignments/a1", { method: "DELETE" }), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 for unknown assignment", async () => {
    prismaMock.welcomeDutyAssignment.findFirst.mockResolvedValue(null);
    const res = await deleteAssignment(new Request("http://localhost/api/welcome-duty/assignments/nope", { method: "DELETE" }), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});

// ─── Suggestions ───────────────────────────────────────────────────────────

const { GET: getSuggestions } = await import("../suggestions/route");

describe("GET /api/welcome-duty/suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("returns suggestions sorted by last served", async () => {
    prismaMock.welcomeDutyAssignment.findMany.mockResolvedValue([]);
    prismaMock.welcomeDutyFamily.findMany.mockResolvedValue([
      { id: "f1", familyId: 1, familyName: "Famille A", active: true, churchId: "church-1", createdAt: new Date(), assignments: [{ event: { date: new Date("2026-01-01") } }] },
      { id: "f2", familyId: 2, familyName: "Famille B", active: true, churchId: "church-1", createdAt: new Date(), assignments: [] },
    ]);

    const res = await getSuggestions(new Request("http://localhost/api/welcome-duty/suggestions?eventId=evt-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Never served (f2) comes first
    expect(body[0].id).toBe("f2");
    expect(body[1].id).toBe("f1");
  });

  it("excludes already-assigned families", async () => {
    prismaMock.welcomeDutyAssignment.findMany.mockResolvedValue([
      { welcomeDutyFamilyId: "f1" },
    ]);
    prismaMock.welcomeDutyFamily.findMany.mockResolvedValue([
      { id: "f2", familyId: 2, familyName: "Famille B", active: true, churchId: "church-1", createdAt: new Date(), assignments: [] },
    ]);

    const res = await getSuggestions(new Request("http://localhost/api/welcome-duty/suggestions?eventId=evt-1"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("f2");
  });
});
