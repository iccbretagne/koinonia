import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const mockCreateNotification = vi.fn();
vi.mock("@/lib/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

const {
  computeNetChanges,
  buildPlanningDigest,
  planningKey,
  recordPlanningChanges,
  recordRemovedPlannings,
  flushPlanningChangeNotices,
} = await import("../planning-change-notices");

const NOW = new Date("2026-11-01T10:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const FUTURE = new Date("2026-11-15T10:00:00Z");

describe("computeNetChanges", () => {
  const row = (eventId: string, previousStatus: string | null, departmentId = "d1") => ({
    eventId,
    departmentId,
    previousStatus: previousStatus as never,
  });
  const current = (entries: [string, string, string | null][]) =>
    new Map(entries.map(([e, d, s]) => [planningKey(e, d), s as never]));

  it("ajouté, retiré et statut modifié", () => {
    const net = computeNetChanges(
      [row("e1", null), row("e2", "EN_SERVICE"), row("e3", "REMPLACANT")],
      current([
        ["e1", "d1", "EN_SERVICE"],
        ["e3", "d1", "EN_SERVICE"],
      ])
    );
    expect(net).toEqual([
      { kind: "ADDED", eventId: "e1", departmentId: "d1", status: "EN_SERVICE" },
      { kind: "REMOVED", eventId: "e2", departmentId: "d1" },
      { kind: "CHANGED", eventId: "e3", departmentId: "d1", from: "REMPLACANT", to: "EN_SERVICE" },
    ]);
  });

  it("un aller-retour (ajouté puis retiré, retiré puis remis) ne laisse aucun changement", () => {
    expect(computeNetChanges([row("e1", null), row("e2", "EN_SERVICE")], current([["e2", "d1", "EN_SERVICE"]]))).toEqual([]);
  });

  it("INDISPONIBLE (statut hérité) vaut « ne sert pas »", () => {
    expect(computeNetChanges([row("e1", "INDISPONIBLE")], current([["e1", "d1", null]]))).toEqual([]);
    expect(computeNetChanges([row("e1", "INDISPONIBLE")], current([["e1", "d1", "EN_SERVICE"]]))).toEqual([
      { kind: "ADDED", eventId: "e1", departmentId: "d1", status: "EN_SERVICE" },
    ]);
  });
});

describe("buildPlanningDigest", () => {
  it("trie par date, indique date, événement, département et nature, et pointe vers « Mon planning »", () => {
    const digest = buildPlanningDigest([
      { kind: "REMOVED", eventId: "e2", departmentId: "d1", eventTitle: "Culte", eventDate: new Date("2026-11-22T10:00:00Z"), departmentName: "Choristes" },
      { kind: "ADDED", eventId: "e1", departmentId: "d1", status: "EN_SERVICE", eventTitle: "Culte", eventDate: new Date("2026-11-15T10:00:00Z"), departmentName: "Choristes" },
      { kind: "CHANGED", eventId: "e3", departmentId: "d2", from: "REMPLACANT", to: "EN_SERVICE", eventTitle: "Répétition", eventDate: new Date("2026-11-18T18:00:00Z"), departmentName: "Musiciens" },
    ]);

    expect(digest.title).toBe("Planning mis à jour");
    expect(digest.link).toBe("/planning");
    expect(digest.lines).toHaveLength(3);
    expect(digest.lines[0]).toContain("15 novembre");
    expect(digest.lines[0]).toContain("« Culte » (Choristes) : vous servez, en service");
    expect(digest.lines[1]).toContain("« Répétition » (Musiciens) : remplaçant → en service");
    expect(digest.lines[2]).toContain("22 novembre");
    expect(digest.lines[2]).toContain("vous ne servez plus");
    expect(digest.message).toBe(digest.lines.join(" "));
  });
});

describe("recordPlanningChanges", () => {
  const change = (memberId: string, eventId = "e1", previousStatus: string | null = null) => ({
    memberId,
    eventId,
    departmentId: "d1",
    previousStatus: previousStatus as never,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);
    prismaMock.event.findMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
    prismaMock.planningChangeNotice.upsert.mockResolvedValue({});
    prismaMock.planningChangeNotice.updateMany.mockResolvedValue({ count: 1 });
  });

  it("enregistre le statut d'origine à la création et ne l'écrase jamais (seule la date avance)", async () => {
    await recordPlanningChanges(prismaMock as never, "church-1", [change("m1", "e1", "REMPLACANT")], { now: NOW });

    expect(prismaMock.planningChangeNotice.upsert).toHaveBeenCalledWith({
      where: { memberId_eventId_departmentId: { memberId: "m1", eventId: "e1", departmentId: "d1" } },
      create: { churchId: "church-1", memberId: "m1", eventId: "e1", departmentId: "d1", previousStatus: "REMPLACANT", lastChangedAt: NOW },
      update: { lastChangedAt: NOW },
    });
  });

  it("aligne la date de toutes les lignes du STAR : le délai court par STAR", async () => {
    await recordPlanningChanges(prismaMock as never, "church-1", [change("m1", "e1"), change("m1", "e2"), change("m2")], { now: NOW });

    expect(prismaMock.planningChangeNotice.updateMany).toHaveBeenCalledWith({
      where: { churchId: "church-1", memberId: { in: ["m1", "m2"] } },
      data: { lastChangedAt: NOW },
    });
  });

  it("n'enregistre rien pour l'auteur de la modification", async () => {
    prismaMock.memberUserLink.findMany.mockResolvedValue([{ memberId: "m-author" }]);

    const res = await recordPlanningChanges(prismaMock as never, "church-1", [change("m-author"), change("m2")], {
      actorId: "u-author",
      now: NOW,
    });

    expect(res.recorded).toBe(1);
    expect(prismaMock.planningChangeNotice.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.planningChangeNotice.upsert.mock.calls[0][0].create.memberId).toBe("m2");
    expect(prismaMock.memberUserLink.findMany).toHaveBeenCalledWith({
      where: { userId: "u-author", churchId: "church-1", validatedAt: { not: null } },
      select: { memberId: true },
    });
  });

  it("n'enregistre rien pour un événement passé (ou d'une autre église)", async () => {
    prismaMock.event.findMany.mockResolvedValue([{ id: "e2" }]); // e1 absent de la requête « à venir »

    const res = await recordPlanningChanges(prismaMock as never, "church-1", [change("m1", "e1"), change("m1", "e2")], { now: NOW });

    expect(res.recorded).toBe(1);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["e1", "e2"] }, churchId: "church-1", date: { gte: NOW } },
      select: { id: true },
    });
    expect(prismaMock.planningChangeNotice.upsert.mock.calls[0][0].create.eventId).toBe("e2");
  });

  it("ne fait rien sans changement", async () => {
    expect(await recordPlanningChanges(prismaMock as never, "church-1", [], { now: NOW })).toEqual({ recorded: 0 });
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
    expect(prismaMock.planningChangeNotice.updateMany).not.toHaveBeenCalled();
  });
});

describe("recordRemovedPlannings", () => {
  it("enregistre, pour chaque STAR planifié dans les départements retirés, son statut d'origine", async () => {
    vi.clearAllMocks();
    prismaMock.planning.findMany.mockResolvedValue([
      { memberId: "m1", status: "EN_SERVICE", eventDepartment: { eventId: "e1", departmentId: "d1" } },
      { memberId: "m2", status: "REMPLACANT", eventDepartment: { eventId: "e1", departmentId: "d1" } },
    ]);
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);
    prismaMock.event.findMany.mockResolvedValue([{ id: "e1" }]);
    prismaMock.planningChangeNotice.upsert.mockResolvedValue({});
    prismaMock.planningChangeNotice.updateMany.mockResolvedValue({ count: 2 });

    const res = await recordRemovedPlannings(prismaMock as never, "church-1", ["ed-1"], { now: NOW });

    expect(res.recorded).toBe(2);
    expect(prismaMock.planning.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventDepartmentId: { in: ["ed-1"] } } })
    );
    expect(prismaMock.planningChangeNotice.upsert.mock.calls.map((c) => c[0].create.previousStatus)).toEqual(["EN_SERVICE", "REMPLACANT"]);
  });

  it("ne lit rien sans département retiré", async () => {
    vi.clearAllMocks();
    expect(await recordRemovedPlannings(prismaMock as never, "church-1", [])).toEqual({ recorded: 0 });
    expect(prismaMock.planning.findMany).not.toHaveBeenCalled();
  });
});

describe("flushPlanningChangeNotices", () => {
  const notice = (over: Record<string, unknown> = {}) => ({
    id: "n1",
    churchId: "church-1",
    memberId: "m1",
    eventId: "e1",
    departmentId: "d1",
    previousStatus: null,
    lastChangedAt: minutesAgo(20),
    ...over,
  });

  function setup(opts: {
    groups?: { churchId: string; memberId: string; last: Date }[];
    rows?: Record<string, unknown>[];
    deleted?: number;
    current?: { memberId: string; status: string | null; eventId: string; departmentId: string }[];
    events?: { id: string; title: string; date: Date }[];
    links?: { memberId: string; churchId: string; userId: string }[];
    settings?: { churchId: string; planningNoticeDelayMinutes: number }[];
  } = {}) {
    const rows = opts.rows ?? [notice()];
    prismaMock.planningChangeNotice.groupBy.mockResolvedValue(
      (opts.groups ?? [{ churchId: "church-1", memberId: "m1", last: minutesAgo(20) }]).map((g) => ({
        churchId: g.churchId,
        memberId: g.memberId,
        _max: { lastChangedAt: g.last },
      }))
    );
    prismaMock.availabilitySettings.findMany.mockResolvedValue(
      (opts.settings ?? []).map((s) => ({ enabled: true, openMonthsBefore: 2, closeDaysBefore: 7, relanceDaysBefore: 3, ...s }))
    );
    prismaMock.planningChangeNotice.findMany.mockResolvedValue(rows);
    prismaMock.planningChangeNotice.deleteMany.mockResolvedValue({ count: opts.deleted ?? rows.length });
    prismaMock.event.findMany.mockResolvedValue(opts.events ?? [{ id: "e1", title: "Culte", date: FUTURE }]);
    prismaMock.department.findMany.mockResolvedValue([{ id: "d1", name: "Choristes" }, { id: "d2", name: "Musiciens" }]);
    prismaMock.planning.findMany.mockResolvedValue(
      (opts.current ?? [{ memberId: "m1", status: "EN_SERVICE", eventId: "e1", departmentId: "d1" }]).map((c) => ({
        memberId: c.memberId,
        status: c.status,
        eventDepartment: { eventId: c.eventId, departmentId: c.departmentId },
      }))
    );
    prismaMock.memberUserLink.findMany.mockResolvedValue(opts.links ?? [{ memberId: "m1", churchId: "church-1", userId: "u1" }]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateNotification.mockResolvedValue(undefined);
  });

  it("délai non écoulé (15 min par défaut) : rien n'est envoyé ni supprimé", async () => {
    setup({ groups: [{ churchId: "church-1", memberId: "m1", last: minutesAgo(10) }] });

    expect(await flushPlanningChangeNotices(NOW)).toEqual({ notified: 0, members: 0 });
    expect(prismaMock.planningChangeNotice.deleteMany).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("délai écoulé : une notification récapitulative, domaine planning, avec l'email", async () => {
    setup();

    expect(await flushPlanningChangeNotices(NOW)).toEqual({ notified: 1, members: 1 });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const [params, options] = mockCreateNotification.mock.calls[0];
    expect(params).toMatchObject({ userId: "u1", domain: "planning", type: "PLANNING_DIGEST", title: "Planning mis à jour", link: "/planning" });
    expect(params.message).toContain("« Culte » (Choristes) : vous servez, en service");
    expect(options.email.subject).toBe("Planning mis à jour");
    expect(options.email.html).toContain("« Culte » (Choristes)");
    expect(prismaMock.planningChangeNotice.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("plusieurs départements et événements : une seule notification qui les couvre tous", async () => {
    setup({
      rows: [notice({ id: "n1" }), notice({ id: "n2", departmentId: "d2" }), notice({ id: "n3", eventId: "e2" })],
      events: [
        { id: "e1", title: "Culte", date: FUTURE },
        { id: "e2", title: "Culte", date: new Date("2026-11-22T10:00:00Z") },
      ],
      current: [
        { memberId: "m1", status: "EN_SERVICE", eventId: "e1", departmentId: "d1" },
        { memberId: "m1", status: "REMPLACANT", eventId: "e1", departmentId: "d2" },
        { memberId: "m1", status: "EN_SERVICE", eventId: "e2", departmentId: "d1" },
      ],
    });

    await flushPlanningChangeNotices(NOW);

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification.mock.calls[0][0].message).toContain("(Choristes)");
    expect(mockCreateNotification.mock.calls[0][0].message).toContain("(Musiciens)");
    expect(mockCreateNotification.mock.calls[0][1].email.html.match(/<li/g)).toHaveLength(3);
  });

  it("changement net vide : rien n'est envoyé mais les lignes sont supprimées", async () => {
    setup({ rows: [notice({ previousStatus: "EN_SERVICE" })] }); // reste EN_SERVICE

    expect(await flushPlanningChangeNotices(NOW)).toEqual({ notified: 0, members: 0 });
    expect(prismaMock.planningChangeNotice.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("événement supprimé ou passé : ligne écartée, rien d'envoyé", async () => {
    setup({ events: [] });

    expect(await flushPlanningChangeNotices(NOW)).toEqual({ notified: 0, members: 0 });
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["e1"] }, date: { gte: NOW } } }));
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("STAR sans compte relié : ni notification ni erreur", async () => {
    setup({ links: [] });

    expect(await flushPlanningChangeNotices(NOW)).toEqual({ notified: 0, members: 0 });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("une modification arrivée pendant la lecture : STAR abandonné, lignes conservées pour le passage suivant", async () => {
    setup({ deleted: 0 });

    expect(await flushPlanningChangeNotices(NOW)).toEqual({ notified: 0, members: 0 });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("la suppression est conditionnée à la date lue (pas de perte d'une modification concurrente)", async () => {
    setup();

    await flushPlanningChangeNotices(NOW);

    expect(prismaMock.planningChangeNotice.deleteMany).toHaveBeenCalledWith({
      where: { churchId: "church-1", memberId: "m1", id: { in: ["n1"] }, lastChangedAt: { lte: minutesAgo(20) } },
    });
  });

  it("le délai est propre à chaque église, y compris pour les lignes déjà en attente", async () => {
    setup({
      groups: [
        { churchId: "church-1", memberId: "m1", last: minutesAgo(20) }, // délai 30 : pas encore
        { churchId: "church-2", memberId: "m2", last: minutesAgo(20) }, // délai 10 : échu
      ],
      rows: [notice({ churchId: "church-2", memberId: "m2" })],
      current: [{ memberId: "m2", status: "EN_SERVICE", eventId: "e1", departmentId: "d1" }],
      links: [{ memberId: "m2", churchId: "church-2", userId: "u2" }],
      settings: [
        { churchId: "church-1", planningNoticeDelayMinutes: 30 },
        { churchId: "church-2", planningNoticeDelayMinutes: 10 },
      ],
    });

    expect(await flushPlanningChangeNotices(NOW)).toEqual({ notified: 1, members: 1 });
    expect(prismaMock.planningChangeNotice.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.planningChangeNotice.findMany).toHaveBeenCalledWith({ where: { churchId: "church-2", memberId: "m2" } });
    expect(mockCreateNotification.mock.calls[0][0].userId).toBe("u2");
  });

  it("un échec d'envoi est avalé et n'empêche pas les autres STAR", async () => {
    setup();
    mockCreateNotification.mockRejectedValueOnce(new Error("SMTP down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(flushPlanningChangeNotices(NOW)).resolves.toEqual({ notified: 0, members: 1 });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
