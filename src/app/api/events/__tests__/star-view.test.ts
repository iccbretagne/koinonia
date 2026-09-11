import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockCanManage = vi.fn();
const mockCanDeposit = vi.fn();
const mockCanRead = vi.fn();

vi.mock("@/modules/planning", () => ({
  canManageOpeningClosing: (...args: unknown[]) => mockCanManage(...args),
  canDepositAnnouncementSheet: (...args: unknown[]) => mockCanDeposit(...args),
  canReadAnnouncementSheet: (...args: unknown[]) => mockCanRead(...args),
}));

const { GET } = await import("../[eventId]/star-view/route");

const makeParams = (eventId: string) => Promise.resolve({ eventId });

const member = { id: "member-1", firstName: "Jean", lastName: "Dupont" };

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    title: "Culte du dimanche",
    date: new Date("2026-09-13"),
    welcomeDutyEnabled: true,
    church: { name: "ICC Rennes" },
    welcomeDutyAssignments: [],
    openingClosingAssignments: [
      { id: "a-1", slot: "OPENING", member },
      { id: "a-2", slot: "CLOSING", member },
    ],
    announcementSheet: null,
    eventDepts: [],
    ...overrides,
  };
}

describe("GET /api/events/[eventId]/star-view — openingClosing (spec 041)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.audioService.findUnique.mockResolvedValue(null);
    mockCanDeposit.mockResolvedValue(false);
    mockCanRead.mockResolvedValue(false);
  });

  it("répartit les désignations par créneau et inclut canManage", async () => {
    prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
    mockCanManage.mockResolvedValue(true);

    const res = await GET(new Request("http://localhost/api/events/event-1/star-view"), {
      params: makeParams("event-1"),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openingClosing.opening).toEqual([{ id: "a-1", member }]);
    expect(body.openingClosing.closing).toEqual([{ id: "a-2", member }]);
    expect(body.openingClosing.canManage).toBe(true);
  });

  it("canManage reflète le droit renvoyé par canManageOpeningClosing", async () => {
    prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
    mockCanManage.mockResolvedValue(false);

    const res = await GET(new Request("http://localhost/api/events/event-1/star-view"), {
      params: makeParams("event-1"),
    });

    const body = await res.json();
    expect(body.openingClosing.canManage).toBe(false);
  });

  it("renvoie des listes vides quand aucune désignation n'existe", async () => {
    prismaMock.event.findUnique.mockResolvedValue(
      buildEvent({ openingClosingAssignments: [] }) as never
    );
    mockCanManage.mockResolvedValue(true);

    const res = await GET(new Request("http://localhost/api/events/event-1/star-view"), {
      params: makeParams("event-1"),
    });

    const body = await res.json();
    expect(body.openingClosing.opening).toEqual([]);
    expect(body.openingClosing.closing).toEqual([]);
  });
});

describe("GET /api/events/[eventId]/star-view — announcementSheet (spec 040)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.audioService.findUnique.mockResolvedValue(null);
    mockCanManage.mockResolvedValue(false);
  });

  it("renvoie announcementSheet vide avec droits déposant/lecteur quand aucune feuille", async () => {
    prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
    mockCanDeposit.mockResolvedValue(true);
    mockCanRead.mockResolvedValue(true);

    const res = await GET(new Request("http://localhost/api/events/event-1/star-view"), {
      params: makeParams("event-1"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.announcementSheet).toEqual({
      filename: null,
      uploadedAt: null,
      canDeposit: true,
      canRead: true,
    });
  });

  it("renvoie le nom et la date de dépôt quand une feuille existe", async () => {
    const uploadedAt = new Date("2026-09-10T10:00:00.000Z");
    prismaMock.event.findUnique.mockResolvedValue(
      buildEvent({ announcementSheet: { filename: "annonces.pdf", uploadedAt } }) as never
    );
    mockCanDeposit.mockResolvedValue(false);
    mockCanRead.mockResolvedValue(true);

    const res = await GET(new Request("http://localhost/api/events/event-1/star-view"), {
      params: makeParams("event-1"),
    });
    const body = await res.json();

    expect(body.announcementSheet).toEqual({
      filename: "annonces.pdf",
      uploadedAt: uploadedAt.toISOString(),
      canDeposit: false,
      canRead: true,
    });
  });

  it("canDeposit/canRead à false pour un rôle non habilité", async () => {
    prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
    mockCanDeposit.mockResolvedValue(false);
    mockCanRead.mockResolvedValue(false);

    const res = await GET(new Request("http://localhost/api/events/event-1/star-view"), {
      params: makeParams("event-1"),
    });
    const body = await res.json();

    expect(body.announcementSheet.canDeposit).toBe(false);
    expect(body.announcementSheet.canRead).toBe(false);
  });
});
