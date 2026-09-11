import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireCurrentChurchPermission = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireCurrentChurchPermission: (...args: unknown[]) => mockRequireCurrentChurchPermission(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockCanRead = vi.fn();

vi.mock("@/modules/planning", () => ({
  canReadAnnouncementSheet: (...args: unknown[]) => mockCanRead(...args),
}));

const { GET } = await import("../announcement-sheets/route");

describe("GET /api/events/announcement-sheets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentChurchPermission.mockResolvedValue({
      session: createAdminSession(),
      churchId: "church-1",
    });
    mockCanRead.mockResolvedValue(true);
  });

  it("liste les événements à venir avec leur feuille éventuelle", async () => {
    prismaMock.event.findMany.mockResolvedValue([
      {
        id: "event-1",
        title: "Culte du dimanche",
        date: new Date("2026-09-13"),
        announcementSheet: { filename: "annonces.pdf", uploadedAt: new Date("2026-09-10") },
      },
      {
        id: "event-2",
        title: "Culte du mercredi",
        date: new Date("2026-09-16"),
        announcementSheet: null,
      },
    ] as never);

    const res = await GET(new Request("http://localhost/api/events/announcement-sheets"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].sheet.filename).toBe("annonces.pdf");
    expect(body[1].sheet).toBeNull();
  });

  it("applique le filtre ?from=&to=", async () => {
    prismaMock.event.findMany.mockResolvedValue([] as never);

    await GET(
      new Request("http://localhost/api/events/announcement-sheets?from=2026-10-01&to=2026-10-31")
    );

    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          churchId: "church-1",
          date: { gte: new Date("2026-10-01"), lte: new Date("2026-10-31") },
        },
      })
    );
  });

  it("renvoie 403 pour un utilisateur non lecteur", async () => {
    mockCanRead.mockResolvedValue(false);

    const res = await GET(new Request("http://localhost/api/events/announcement-sheets"));
    expect(res.status).toBe(403);
  });
});
