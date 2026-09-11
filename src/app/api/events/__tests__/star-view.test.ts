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
vi.mock("@/modules/planning", () => ({
  canManageOpeningClosing: (...args: unknown[]) => mockCanManage(...args),
}));

const { GET } = await import("../[eventId]/star-view/route");

const makeParams = (eventId: string) => Promise.resolve({ eventId });

const member = { id: "member-1", firstName: "Jean", lastName: "Dupont" };

const baseEvent = {
  id: "evt-1",
  title: "Culte du dimanche",
  date: new Date("2026-09-13"),
  welcomeDutyEnabled: false,
  church: { name: "Église Test" },
  welcomeDutyAssignments: [],
  eventDepts: [],
  openingClosingAssignments: [
    { id: "a-1", slot: "OPENING", member },
    { id: "a-2", slot: "CLOSING", member },
  ],
};

describe("GET /api/events/[eventId]/star-view — openingClosing (spec 041)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.event.findUnique.mockResolvedValue(baseEvent as never);
    prismaMock.audioService.findUnique.mockResolvedValue(null);
  });

  it("répartit les désignations par créneau et inclut canManage", async () => {
    mockCanManage.mockResolvedValue(true);

    const request = new Request("http://localhost/api/events/evt-1/star-view");
    const res = await GET(request, { params: makeParams("evt-1") });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openingClosing.opening).toEqual([{ id: "a-1", member }]);
    expect(body.openingClosing.closing).toEqual([{ id: "a-2", member }]);
    expect(body.openingClosing.canManage).toBe(true);
  });

  it("canManage reflète le droit renvoyé par canManageOpeningClosing", async () => {
    mockCanManage.mockResolvedValue(false);

    const request = new Request("http://localhost/api/events/evt-1/star-view");
    const res = await GET(request, { params: makeParams("evt-1") });

    const body = await res.json();
    expect(body.openingClosing.canManage).toBe(false);
  });

  it("renvoie des listes vides quand aucune désignation n'existe", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      ...baseEvent,
      openingClosingAssignments: [],
    } as never);
    mockCanManage.mockResolvedValue(true);

    const request = new Request("http://localhost/api/events/evt-1/star-view");
    const res = await GET(request, { params: makeParams("evt-1") });

    const body = await res.json();
    expect(body.openingClosing.opening).toEqual([]);
    expect(body.openingClosing.closing).toEqual([]);
  });
});
