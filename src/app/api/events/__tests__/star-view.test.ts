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

const mockCanDeposit = vi.fn();
const mockCanRead = vi.fn();

vi.mock("@/modules/planning", () => ({
  canDepositAnnouncementSheet: (...args: unknown[]) => mockCanDeposit(...args),
  canReadAnnouncementSheet: (...args: unknown[]) => mockCanRead(...args),
}));

const { GET } = await import("../[eventId]/star-view/route");

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    title: "Culte du dimanche",
    date: new Date("2026-09-13"),
    welcomeDutyEnabled: true,
    church: { name: "ICC Rennes" },
    welcomeDutyAssignments: [],
    announcementSheet: null,
    eventDepts: [],
    ...overrides,
  };
}

describe("GET /api/events/[eventId]/star-view — announcementSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.audioService.findUnique.mockResolvedValue(null);
  });

  it("renvoie announcementSheet vide avec droits déposant/lecteur quand aucune feuille", async () => {
    prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
    mockCanDeposit.mockResolvedValue(true);
    mockCanRead.mockResolvedValue(true);

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ eventId: "event-1" }),
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

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ eventId: "event-1" }),
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

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ eventId: "event-1" }),
    });
    const body = await res.json();

    expect(body.announcementSheet.canDeposit).toBe(false);
    expect(body.announcementSheet.canRead).toBe(false);
  });
});
