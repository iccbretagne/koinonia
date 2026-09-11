import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequirePermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockCanManage = vi.fn();
const mockFindActiveAbsence = vi.fn();
const mockNotifyAssignment = vi.fn().mockResolvedValue(undefined);
const mockNotifyRemoval = vi.fn().mockResolvedValue(undefined);
vi.mock("@/modules/planning", () => ({
  canManageOpeningClosing: (...args: unknown[]) => mockCanManage(...args),
  findActiveAbsenceForMember: (...args: unknown[]) => mockFindActiveAbsence(...args),
  notifyAssignment: (...args: unknown[]) => mockNotifyAssignment(...args),
  notifyRemoval: (...args: unknown[]) => mockNotifyRemoval(...args),
}));

const { GET, POST } = await import("../[eventId]/opening-closing/route");
const { DELETE } = await import("../[eventId]/opening-closing/[id]/route");

const makeParams = (eventId: string) => Promise.resolve({ eventId });
const makeParamsWithId = (eventId: string, id: string) => Promise.resolve({ eventId, id });

const member = { id: "member-1", firstName: "Jean", lastName: "Dupont" };

describe("GET /api/events/[eventId]/opening-closing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("renvoie une liste vide quand aucune désignation n'existe", async () => {
    prismaMock.openingClosingAssignment.findMany.mockResolvedValue([]);

    const request = new Request("http://localhost/api/events/evt-1/opening-closing");
    const res = await GET(request, { params: makeParams("evt-1") });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ opening: [], closing: [] });
  });

  it("répartit les désignations par créneau", async () => {
    prismaMock.openingClosingAssignment.findMany.mockResolvedValue([
      { id: "a-1", slot: "OPENING", member },
      { id: "a-2", slot: "CLOSING", member },
    ] as never);

    const request = new Request("http://localhost/api/events/evt-1/opening-closing");
    const res = await GET(request, { params: makeParams("evt-1") });

    const body = await res.json();
    expect(body.opening).toHaveLength(1);
    expect(body.closing).toHaveLength(1);
  });
});

describe("POST /api/events/[eventId]/opening-closing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    mockCanManage.mockResolvedValue(true);
    mockFindActiveAbsence.mockResolvedValue(null);
    prismaMock.event.findFirst.mockResolvedValue({
      id: "evt-1",
      churchId: "church-1",
      title: "Culte du dimanche",
      date: new Date("2026-09-13"),
    } as never);
    prismaMock.member.findFirst.mockResolvedValue(member as never);
    prismaMock.openingClosingAssignment.create.mockResolvedValue({
      id: "a-1",
      slot: "OPENING",
      member,
    } as never);
  });

  it("crée la désignation et notifie le membre", async () => {
    const request = new Request("http://localhost/api/events/evt-1/opening-closing", {
      method: "POST",
      body: JSON.stringify({ slot: "OPENING", memberId: "member-1" }),
    });
    const res = await POST(request, { params: makeParams("evt-1") });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.assignment.id).toBe("a-1");
    expect(body.absenceWarning).toBe(false);
    expect(mockNotifyAssignment).toHaveBeenCalledWith(
      "church-1",
      "member-1",
      "Culte du dimanche",
      "Ouverture"
    );
  });

  it("refuse (403) un rôle non habilité à désigner", async () => {
    mockCanManage.mockResolvedValue(false);

    const request = new Request("http://localhost/api/events/evt-1/opening-closing", {
      method: "POST",
      body: JSON.stringify({ slot: "OPENING", memberId: "member-1" }),
    });
    const res = await POST(request, { params: makeParams("evt-1") });

    expect(res.status).toBe(403);
  });

  it("signale absenceWarning si le membre a une absence active chevauchante", async () => {
    mockFindActiveAbsence.mockResolvedValue({
      id: "abs-1",
      startDate: new Date("2026-09-10"),
      endDate: new Date("2026-09-15"),
    });

    const request = new Request("http://localhost/api/events/evt-1/opening-closing", {
      method: "POST",
      body: JSON.stringify({ slot: "OPENING", memberId: "member-1" }),
    });
    const res = await POST(request, { params: makeParams("evt-1") });

    const body = await res.json();
    expect(body.absenceWarning).toBe(true);
  });

  it("rejette (400) un payload invalide", async () => {
    const request = new Request("http://localhost/api/events/evt-1/opening-closing", {
      method: "POST",
      body: JSON.stringify({ slot: "INVALID", memberId: "" }),
    });
    const res = await POST(request, { params: makeParams("evt-1") });

    expect(res.status).toBe(400);
  });

  it("404 si l'événement n'appartient pas à l'église résolue", async () => {
    prismaMock.event.findFirst.mockResolvedValue(null);

    const request = new Request("http://localhost/api/events/evt-1/opening-closing", {
      method: "POST",
      body: JSON.stringify({ slot: "OPENING", memberId: "member-1" }),
    });
    const res = await POST(request, { params: makeParams("evt-1") });

    expect(res.status).toBe(404);
  });

  it("404 si le membre n'appartient pas à l'église résolue", async () => {
    prismaMock.member.findFirst.mockResolvedValue(null);

    const request = new Request("http://localhost/api/events/evt-1/opening-closing", {
      method: "POST",
      body: JSON.stringify({ slot: "OPENING", memberId: "member-1" }),
    });
    const res = await POST(request, { params: makeParams("evt-1") });

    expect(res.status).toBe(404);
  });

  it("renvoie une erreur sur violation de la contrainte d'unicité (déjà désigné sur ce créneau)", async () => {
    prismaMock.openingClosingAssignment.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    const request = new Request("http://localhost/api/events/evt-1/opening-closing", {
      method: "POST",
      body: JSON.stringify({ slot: "OPENING", memberId: "member-1" }),
    });
    const res = await POST(request, { params: makeParams("evt-1") });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

describe("DELETE /api/events/[eventId]/opening-closing/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    mockCanManage.mockResolvedValue(true);
  });

  it("supprime la désignation et notifie le membre retiré", async () => {
    prismaMock.openingClosingAssignment.findFirst.mockResolvedValue({
      id: "a-1",
      memberId: "member-1",
      slot: "OPENING",
      event: { title: "Culte du dimanche" },
    } as never);
    prismaMock.openingClosingAssignment.delete.mockResolvedValue({} as never);

    const request = new Request("http://localhost/api/events/evt-1/opening-closing/a-1", {
      method: "DELETE",
    });
    const res = await DELETE(request, { params: makeParamsWithId("evt-1", "a-1") });

    expect(res.status).toBe(200);
    expect(mockNotifyRemoval).toHaveBeenCalledWith(
      "church-1",
      "member-1",
      "Culte du dimanche",
      "Ouverture"
    );
  });

  it("refuse (403) un rôle non habilité à retirer", async () => {
    mockCanManage.mockResolvedValue(false);

    const request = new Request("http://localhost/api/events/evt-1/opening-closing/a-1", {
      method: "DELETE",
    });
    const res = await DELETE(request, { params: makeParamsWithId("evt-1", "a-1") });

    expect(res.status).toBe(403);
  });

  it("404 si la désignation n'existe pas", async () => {
    prismaMock.openingClosingAssignment.findFirst.mockResolvedValue(null);

    const request = new Request("http://localhost/api/events/evt-1/opening-closing/unknown", {
      method: "DELETE",
    });
    const res = await DELETE(request, { params: makeParamsWithId("evt-1", "unknown") });

    expect(res.status).toBe(404);
  });
});
