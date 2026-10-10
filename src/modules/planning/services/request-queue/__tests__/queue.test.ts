import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { listDoneRequests, loadRequestQueue, DONE_PAGE_SIZE } from "../queue";

const NOW = new Date("2026-10-10T10:00:00Z");
const SINCE = new Date("2026-09-10T10:00:00Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    churchId: "church-1",
    type: "DIFFUSION_INTERNE",
    status: "EN_ATTENTE",
    title: "Annonce",
    payload: {},
    submittedAt: new Date("2026-10-01T08:00:00Z"),
    updatedAt: new Date("2026-10-02T08:00:00Z"),
    reviewNotes: null,
    executionError: null,
    submittedBy: { name: "Marie", displayName: null },
    reviewedBy: null,
    department: { name: "Louange" },
    ministry: null,
    announcement: null,
    parentRequest: null,
    childRequests: [],
    ...overrides,
  };
}

/** Arguments du n-ième appel à `request.findMany`. */
function findManyArgs(n = 0) {
  return prismaMock.request.findMany.mock.calls[n][0] as { where: unknown; take?: number; orderBy?: unknown };
}

describe("loadRequestQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.request.findMany.mockResolvedValue([] as never);
    prismaMock.request.count.mockResolvedValue(0);
    prismaMock.request.findFirst.mockResolvedValue(null);
    prismaMock.event.findMany.mockResolvedValue([] as never);
  });

  it("Secrétariat : demandes racines des types routés vers la fonction", async () => {
    await loadRequestQueue("church-1", "SECRETARIAT", undefined, NOW);
    const scope = (findManyArgs(0).where as { AND: Record<string, unknown>[] }).AND[0];
    expect(scope).toMatchObject({ churchId: "church-1", parentRequestId: null });
    expect((scope.type as { in: string[] }).in).toEqual(
      expect.arrayContaining(["DIFFUSION_INTERNE", "AJOUT_EVENEMENT", "MODIFICATION_EVENEMENT", "ANNULATION_EVENEMENT", "MODIFICATION_PLANNING", "DEMANDE_ACCES"])
    );
    expect((scope.type as { in: string[] }).in).not.toContain("VISUEL");
  });

  it("Communication et Visuels : toutes les demandes de leur type", async () => {
    await loadRequestQueue("church-1", "COMMUNICATION", undefined, NOW);
    expect((findManyArgs(0).where as { AND: unknown[] }).AND[0]).toEqual({ churchId: "church-1", type: "RESEAUX_SOCIAUX" });
    vi.clearAllMocks();
    prismaMock.request.findMany.mockResolvedValue([] as never);
    await loadRequestQueue("church-1", "PRODUCTION_MEDIA", undefined, NOW);
    expect((findManyArgs(0).where as { AND: unknown[] }).AND[0]).toEqual({ churchId: "church-1", type: "VISUEL" });
  });

  it("file ouverte (en attente, en cours) et traitées bornées à 30 jours, une page au plus", async () => {
    await loadRequestQueue("church-1", "SECRETARIAT", undefined, NOW);
    expect((findManyArgs(0).where as { AND: unknown[] }).AND[1]).toEqual({ status: { in: ["EN_ATTENTE", "EN_COURS"] } });
    const done = findManyArgs(1);
    expect(JSON.stringify(done.where)).toContain(SINCE.toISOString());
    expect(done.take).toBe(DONE_PAGE_SIZE);
    expect(done.orderBy).toEqual([{ updatedAt: "desc" }, { id: "desc" }]);
  });

  it("propose « Voir plus » quand un historique plus ancien existe, même si la fenêtre est vide", async () => {
    prismaMock.request.findFirst.mockResolvedValue({ id: "old" } as never);
    const queue = await loadRequestQueue("church-1", "SECRETARIAT", undefined, NOW);
    expect(queue.done.items).toEqual([]);
    expect(queue.done.nextCursor).toBe(`${SINCE.toISOString()}_~`);
  });

  it("pas de « Voir plus » sans historique plus ancien", async () => {
    const queue = await loadRequestQueue("church-1", "SECRETARIAT", undefined, NOW);
    expect(queue.done.nextCursor).toBeNull();
  });

  it("calcule l'échéance et le résumé de modification à partir d'une lecture groupée des événements", async () => {
    prismaMock.request.findMany
      .mockResolvedValueOnce([
        row({ id: "m", type: "MODIFICATION_EVENEMENT", payload: { eventId: "evt-1", changes: { title: "Nouveau" } } }),
        row({ id: "p", type: "MODIFICATION_PLANNING", payload: { eventId: "evt-1" } }),
      ] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.event.findMany.mockResolvedValue([
      { id: "evt-1", title: "Culte", type: "CULTE", date: new Date("2026-10-18T08:00:00Z"), planningDeadline: new Date("2026-10-14T00:00:00Z") },
    ] as never);

    const queue = await loadRequestQueue("church-1", "SECRETARIAT", undefined, NOW);

    expect(prismaMock.event.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["evt-1"] }, churchId: "church-1" } }));
    const [m, p] = queue.open;
    expect(m.deadline).toBe("2026-10-18T08:00:00.000Z");
    expect(m.eventChanges).toEqual([{ field: "title", label: "Titre", before: "Culte", after: "Nouveau" }]);
    expect(p).toMatchObject({ deadline: "2026-10-14T00:00:00.000Z", deadlineKind: "planning" });
  });

  it("sérialise demandeur, origine, annonce et suites", async () => {
    prismaMock.request.findMany
      .mockResolvedValueOnce([
        row({
          announcement: {
            id: "ann-1",
            title: "Soirée",
            content: "Texte",
            eventDate: null,
            isSaveTheDate: false,
            isUrgent: true,
            targetEvents: [{ event: { id: "evt-2", title: "Culte", date: new Date("2026-10-11T08:00:00Z") } }],
          },
          childRequests: [{ id: "c1", type: "VISUEL", status: "LIVRE", payload: { deliveryLink: "https://x.test" } }],
        }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    const [item] = (await loadRequestQueue("church-1", "SECRETARIAT", undefined, NOW)).open;
    expect(item).toMatchObject({
      author: "Marie",
      source: "Louange",
      deadline: "2026-10-11T08:00:00.000Z",
      deadlineKind: "culte",
      children: [{ id: "c1", type: "VISUEL", status: "LIVRE", deliveryLink: "https://x.test" }],
    });
    expect(item.announcement?.targetEvents).toEqual([{ id: "evt-2", title: "Culte", date: "2026-10-11T08:00:00.000Z" }]);
  });
});

describe("listDoneRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.request.findMany.mockResolvedValue([] as never);
    prismaMock.event.findMany.mockResolvedValue([] as never);
  });

  it("reprend après le curseur, sans fenêtre de dates", async () => {
    await listDoneRequests("church-1", "COMMUNICATION", { cursor: "2026-09-01T00:00:00.000Z_req-9" }, undefined, NOW);
    const { where, take } = findManyArgs(0) as { where: { AND: unknown[] }; take: number };
    expect(take).toBe(DONE_PAGE_SIZE + 1);
    expect(where.AND).toContainEqual({
      OR: [
        { updatedAt: { lt: new Date("2026-09-01T00:00:00.000Z") } },
        { updatedAt: new Date("2026-09-01T00:00:00.000Z"), id: { lt: "req-9" } },
      ],
    });
    expect(JSON.stringify(where)).not.toContain(SINCE.toISOString());
  });

  it("cherche dans tout l'historique : titre, annonce, demandeur, département, ministère", async () => {
    await listDoneRequests("church-1", "SECRETARIAT", { q: " noël " }, undefined, NOW);
    const { where } = findManyArgs(0) as { where: { AND: { OR?: unknown[] }[] } };
    const search = where.AND.find((c) => Array.isArray(c.OR) && JSON.stringify(c.OR).includes("noël"));
    expect(search?.OR).toHaveLength(6);
    expect(JSON.stringify(where)).not.toContain(SINCE.toISOString());
  });

  it("renvoie un curseur seulement s'il reste des demandes", async () => {
    const rows = Array.from({ length: DONE_PAGE_SIZE + 1 }, (_, i) =>
      row({ id: `r${i}`, status: "LIVRE", updatedAt: new Date(Date.UTC(2026, 8, 30 - i)) })
    );
    prismaMock.request.findMany.mockResolvedValue(rows as never);
    const page = await listDoneRequests("church-1", "SECRETARIAT", {}, undefined, NOW);
    expect(page.items).toHaveLength(DONE_PAGE_SIZE);
    expect(page.nextCursor).toBe(`${rows[DONE_PAGE_SIZE - 1].updatedAt.toISOString()}_r${DONE_PAGE_SIZE - 1}`);

    prismaMock.request.findMany.mockResolvedValue(rows.slice(0, 3) as never);
    expect((await listDoneRequests("church-1", "SECRETARIAT", {}, undefined, NOW)).nextCursor).toBeNull();
  });

  it("ignore un curseur illisible", async () => {
    await listDoneRequests("church-1", "SECRETARIAT", { cursor: "n'importe quoi" }, undefined, NOW);
    expect(JSON.stringify(findManyArgs(0).where)).not.toContain("updatedAt");
  });
});
