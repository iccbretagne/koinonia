import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import { prismaMock } from "@/__mocks__/prisma";
import { DATA_ANSWER_MAX_ITEMS, isDataRefusal, pageAnswer, type DataAnswer } from "@/core/assistant";
import { viewerFor } from "./viewers";

const SECRET = "jean.dupont@exemple.fr 06 12 34 56 78 FR76 3000 6000 0112 3456 7890 189 https://exemple.fr";
const SENSITIVE = /@|06 12|FR76|https?:|exemple/;

const deptScope = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ getUserDepartmentScope: (...a: unknown[]) => deptScope(...a) }));
vi.mock("@/lib/registry", () => ({ registry: { has: () => true }, rolePermissions: {} }));
vi.mock("@/app/(auth)/planning/my-planning-data", () => ({
  loadMyPlanning: vi.fn(async () => ({
    member: { firstName: "Marie", lastName: "K" },
    plannings: [
      {
        status: "EN_SERVICE",
        eventDepartment: { event: { id: "e1", title: "Culte", date: new Date(Date.now() + 3 * 86_400_000) }, department: { id: "d1", name: "Choristes" } },
      },
    ],
    tasksByEvent: {},
    teamEvents: [],
    withdrawals: [],
    // Coordonnées des responsables affichées après la date limite : jamais recopiées.
    contactsByDepartment: { d1: [{ name: "Paul", email: "jean.dupont@exemple.fr", phone: "06 12 34 56 78" }] },
  })),
}));
vi.mock("@/app/(auth)/requests/my-requests-data", () => ({
  loadMyRequests: vi.fn(async () => [{ type: "VISUEL", status: "EN_ATTENTE", announcement: { title: `Affiche ${SECRET}` } }]),
}));
vi.mock("@/modules/planning", () => ({
  PLANNED_STATUSES: ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"],
  absenceVisibilityWhere: (ids: string[]) => ({ visibleIn: ids }),
  getPlanningAvailability: vi.fn(async (_c: string, _e: unknown, _d: string, ids: string[]) => ({
    members: new Map(ids.map((id) => [id, { state: "UNAVAILABLE" }])),
  })),
  listMemberAvailability: vi.fn(async () => ({ months: [{ month: new Date("2026-12-01T00:00:00Z"), open: true, closesAt: new Date("2026-11-25T00:00:00Z") }], events: [] })),
  listTeamEventsForMember: vi.fn(async () => []),
  loadRequestQueue: vi.fn(async () => ({ open: [{ type: "VISUEL", deadline: "2020-01-01" }] })),
  resolveRequestQueueAccess: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/modules/ticketing", () => ({ listAssignmentsForUser: vi.fn(async () => []) }));
vi.mock("@/modules/audio", () => ({
  listPublishedServices: vi.fn(async () => [{ title: "Culte de rentrée", serviceDate: new Date("2026-11-01T10:00:00Z"), speaker: "Pasteur A", series: null }]),
}));
vi.mock("@/modules/shuttle", () => ({
  getShuttleAccess: vi.fn(async () => ({ manager: false, member: false })),
  currentBalance: vi.fn(async () => 120),
}));
vi.mock("@/modules/treasury", () => ({
  getDashboard: vi.fn(async () => ({ accounts: [{ name: "Caisse", balance: 50 }], total: 50 })),
  listChequesInHand: vi.fn(async () => [{ accountName: "Caisse", count: 1, amount: 30 }]),
}));

const { dataCatalog, DATA_QUESTION_SOURCES } = await import("../_data-questions");
const { BUILTIN_ENTRIES } = await import("@/modules/assistant");

const session = { user: { id: "user-1", isSuperAdmin: false, churchRoles: [] } } as unknown as Session;
const catalog = dataCatalog(() => true);
const run = (key: string, viewer = viewerFor("STAR"), params = {}) =>
  catalog.get(key)!.run({ session, churchId: "church-1", params, viewer });

function stubDatabase() {
  const future = new Date(Date.now() + 2 * 86_400_000);
  prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "m1" });
  prismaMock.memberUserLink.findMany.mockResolvedValue([{ memberId: "m1" }]);
  prismaMock.absence.findMany.mockResolvedValue([{ kind: "PERIOD", startDate: future, endDate: future, targetEvents: [], member: { firstName: "Léa", lastName: "B" } }]);
  prismaMock.availabilityResponse.findMany.mockResolvedValue([]);
  prismaMock.serviceWithdrawal.findMany.mockResolvedValue([
    { status: "REPLACED", event: { title: "Culte", date: future }, department: { name: "Accueil" }, replacementMember: { firstName: "Léa", lastName: "B" }, member: { firstName: "Paul", lastName: "M" } },
  ]);
  prismaMock.departmentNotice.findMany.mockResolvedValue([{ content: `Arrivée 9h, ${SECRET}`, department: { name: "Son" }, event: { id: "e1", title: "Culte", date: future } }]);
  prismaMock.event.findFirst.mockResolvedValue({ date: future });
  prismaMock.event.findMany.mockResolvedValue([{ id: "e1", title: "Culte", date: future, type: "CULTE" }]);
  prismaMock.planning.findMany.mockResolvedValue([
    { status: "EN_SERVICE", member: { firstName: "Léa", lastName: "B" }, eventDepartment: { department: { name: "Son" }, event: { title: "Culte" } } },
  ]);
  prismaMock.eventDepartment.findMany.mockResolvedValue([
    { departmentId: "d1", department: { name: "Son", memberDepts: [{ member: { id: "m2", firstName: "Léa", lastName: "B" } }] }, event: { id: "e1", date: future } },
  ]);
  prismaMock.roomReservation.findMany.mockResolvedValue([{ title: `Répétition ${SECRET}`, startAt: future, endAt: future, room: { name: "Salle A" } }]);
  prismaMock.financialRequest.findMany.mockResolvedValue([
    { label: `Achat ${SECRET}`, amount: 40, status: "SUBMITTED", department: { name: "Son" }, payments: [] },
  ]);
  prismaMock.financialPayment.findMany.mockResolvedValue([{ amount: 40, scheduledDate: future, request: { label: `Achat ${SECRET}` } }]);
  prismaMock.eventReport.findMany.mockResolvedValue([
    {
      speaker: "Pasteur A",
      messageTitle: "La paix",
      notes: `Bilan ${SECRET}`,
      decisions: `Appeler ${SECRET}`,
      event: { id: "e1", title: "Culte", date: future },
      sections: [{ label: "Son", position: 1, stats: null, notes: `Câble ${SECRET}` }],
    },
  ]);
}

const FULL = viewerFor("SUPER_ADMIN", { predicates: ["linkedStar", "pastoral"] });

describe("catalogue des questions de données (spec 075)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deptScope.mockReturnValue({ scoped: false });
    stubDatabase();
  });

  it("couvre chaque fiche de données de la base, sans aucune question du suivi pastoral", () => {
    for (const entry of BUILTIN_ENTRIES.filter((e) => e.kind === "data")) {
      expect(catalog.has(entry.dataQuestion!), entry.key).toBe(true);
    }
    expect(DATA_QUESTION_SOURCES.map((s) => s.module)).not.toContain("care");
    expect([...catalog.keys()].some((k) => k.startsWith("care."))).toBe(false);
  });

  it("ne propose que les questions des modules actifs", () => {
    const keys = [...dataCatalog((m) => m !== "treasury").keys()];
    expect(keys).not.toContain("treasury.balances");
    expect(keys).toContain("planning.myNextService");
  });

  it("refuse sans aucune donnée à un compte qui n'a pas l'écran", async () => {
    const star = viewerFor("STAR");
    for (const key of catalog.keys()) {
      // Ouvertes au STAR : ses propres affectations, la file du secrétariat (prédicat),
      // la bibliothèque d'écoute (`audio:listen`, tous les rôles).
      if (key === "ticketing.myAssignments" || key === "planning.secretariatPending" || key === "audio.recentSermons") continue;
      const result = await run(key, star);
      expect(isDataRefusal(result), key).toBe(true);
    }
  });

  it("cultes publiés et comptes rendus : refusés sans le droit de l'écran (spec 081)", async () => {
    const nobody = { ...viewerFor("STAR"), permissions: [] };
    expect(isDataRefusal(await run("audio.recentSermons", nobody))).toBe(true);
    expect(isDataRefusal(await run("reports.recent", nobody))).toBe(true);
    const reports = await run("reports.recent", FULL);
    expect(JSON.stringify(reports)).toContain("La paix");
    expect(prismaMock.eventReport.findMany.mock.calls[0][0].select).not.toHaveProperty("notes");
  });

  it("ne recopie jamais un email, un téléphone, un IBAN ni un lien", async () => {
    for (const key of catalog.keys()) {
      const result = await run(key, FULL);
      expect(JSON.stringify(result), key).not.toMatch(SENSITIVE);
    }
  });

  it("garde toute la liste et son total : la bulle et le serveur MCP bornent chacun à leur façon", async () => {
    const future = new Date(Date.now() + 86_400_000);
    prismaMock.serviceWithdrawal.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ status: "PENDING", event: { title: `Culte ${i}`, date: future }, department: { name: "Son" }, member: { firstName: "A", lastName: `${i}` } }))
    );
    const result = (await run("planning.toReplace", viewerFor("ADMIN"))) as DataAnswer;
    expect(result.items).toHaveLength(12);
    expect(result.total).toBe(12);
    const bubble = pageAnswer(result, { limit: DATA_ANSWER_MAX_ITEMS });
    expect(bubble.items).toHaveLength(8);
    expect(bubble.total).toBe(12);
  });

  it("libellés nettoyés : espaces de bord retirés, détail vide supprimé, type d'événement en clair", async () => {
    const date = new Date(Date.now() + 86_400_000);
    prismaMock.event.findMany.mockResolvedValue([
      { title: "Culte ", date, type: "CULTE" },
      { title: "Soirée  louange", date, type: "PRIERE" },
    ]);
    const week = (await run("planning.eventsThisWeek", FULL)) as DataAnswer;
    expect(week.items[0].label).toMatch(/· Culte$/);
    expect(week.items[0]).not.toHaveProperty("detail");
    expect(week.items[1].label).toMatch(/· Soirée louange$/);
    expect(week.items[1].detail).toBe("Prière");
    expect(JSON.stringify(week)).not.toContain("CULTE");

    prismaMock.event.findMany.mockResolvedValue([{ id: "e8", title: "Culte  ", date: new Date(Date.now() - 86_400_000) }]);
    const missing = (await run("planning.missingReports", FULL)) as DataAnswer;
    expect(missing.items[0].label).toMatch(/· Culte$/);
    expect(missing.items[0].href).toBe("/admin/events/e8/report");
  });

  it("file du secrétariat : le total compte les lignes, le nombre de demandes est dans le titre", async () => {
    const result = (await run("planning.secretariatPending", FULL)) as DataAnswer;
    expect(result.total).toBe(result.items.length);
    expect(result.title).toBe("Demandes à traiter (1)");
  });

  it("comptes rendus récents : orateur et titre vides annoncés « non renseignés »", async () => {
    prismaMock.eventReport.findMany.mockResolvedValue([
      { speaker: null, messageTitle: "  ", event: { id: "e25", title: "Culte ", date: new Date("2026-10-25T10:00:00Z") } },
      { speaker: "Pasteur A", messageTitle: null, event: { title: "Culte", date: new Date("2026-10-18T10:00:00Z") } },
    ]);
    const result = (await run("reports.recent", FULL)) as DataAnswer;
    expect(result.items[0]).toEqual({ label: "dim. 25 oct. · Culte", detail: "Orateur et titre du message non renseignés", href: "/admin/events/e25/report" });
    expect(result.items[1].detail).toBe("Pasteur A · Titre non renseigné");
  });

  it("compte rendu d'un jour : orateur, message, départements, observations, décisions (spec 081)", async () => {
    prismaMock.eventReport.findMany.mockResolvedValue([
      {
        speaker: "Pasteur A",
        messageTitle: null,
        notes: `Belle louange, ${SECRET}`,
        decisions: null,
        event: { id: "e9", title: "Culte", date: new Date("2026-10-25T09:00:00Z") },
        sections: [
          { label: "Son", position: 2, stats: null, notes: "Micro HS" },
          { label: "Accueil", position: 1, stats: { hommes: 40, femmes: 50, enfants: 10 }, notes: null },
          { label: "Vide", position: 3, stats: null, notes: null },
        ],
      },
    ]);
    const result = (await run("reports.get", FULL, { day: "2026-10-25" })) as DataAnswer;
    expect(result.title).toBe("Compte rendu — dim. 25 oct. · Culte");
    expect(result.href).toBe("/admin/events/e9/report");
    expect(result.items.map((i) => i.label)).toEqual(["Orateur", "Message", "Accueil", "Son", "Observations générales", "Décisions / actions"]);
    expect(result.items[1].detail).toBe("non renseigné");
    expect(result.items[2].detail).toBe("Hommes : 40 | Femmes : 50 | Enfants : 10 · Total adultes : 90 | Total général : 100");
    expect(result.items[3].detail).toBe("Micro HS");
    expect(result.items[4].detail).toContain("Belle louange");
    expect(JSON.stringify(result)).not.toMatch(SENSITIVE);
    const where = prismaMock.eventReport.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ churchId: "church-1", event: { reportEnabled: true } });
  });

  it("compte rendu : refusé sans reports:view ; sans jour, le plus récent ; jour sans compte rendu", async () => {
    expect(isDataRefusal(await run("reports.get", { ...viewerFor("STAR"), permissions: [] }))).toBe(true);
    prismaMock.eventReport.findMany.mockResolvedValue([]);
    const none = (await run("reports.get", FULL, { day: "2026-10-25" })) as DataAnswer;
    expect(none.items).toEqual([]);
    expect(none.empty).toBe("Aucun compte rendu pour ce jour.");
    await run("reports.get", FULL);
    expect(prismaMock.eventReport.findMany.mock.calls.at(-1)![0]).toMatchObject({ take: 1, orderBy: { event: { date: "desc" } } });
  });
});

describe("périmètre identique à l'écran (spec 075)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubDatabase();
    prismaMock.event.findMany.mockResolvedValue([{ id: "e1", title: "Culte", date: new Date("2026-11-08T10:00:00Z"), type: "CULTE" }]);
  });

  it("un responsable de département ne voit que ses départements dans la grille", async () => {
    deptScope.mockReturnValue({ scoped: true, departmentIds: ["d1"] });
    await run("planning.servingOnDay", viewerFor("DEPARTMENT_HEAD"), { day: "2026-11-08" });
    const where = prismaMock.planning.findMany.mock.calls[0][0].where;
    expect(where.eventDepartment.department).toEqual({ id: { in: ["d1"] }, isSystem: false });
    await run("planning.toReplace", viewerFor("DEPARTMENT_HEAD"));
    expect(prismaMock.serviceWithdrawal.findMany.mock.calls[0][0].where.departmentId).toEqual({ in: ["d1"] });
    await run("planning.teamUnavailabilities", viewerFor("DEPARTMENT_HEAD"));
    expect(prismaMock.absence.findMany.mock.calls[0][0].where.AND).toEqual([{ visibleIn: ["d1"] }]);
  });

  it("l'administration voit toute l'église, et un périmètre vide ne lit rien", async () => {
    deptScope.mockReturnValue({ scoped: false });
    await run("planning.servingOnDay", viewerFor("ADMIN"), { day: "2026-11-08" });
    expect(prismaMock.planning.findMany.mock.calls[0][0].where.eventDepartment.department).toEqual({ isSystem: false });
    deptScope.mockReturnValue({ scoped: true, departmentIds: [] });
    prismaMock.planning.findMany.mockClear();
    const result = (await run("planning.servingOnDay", viewerFor("DEPARTMENT_HEAD"), { day: "2026-11-08" })) as DataAnswer;
    expect(result.items).toEqual([]);
    expect(prismaMock.planning.findMany).not.toHaveBeenCalled();
  });

  it("reste dans l'église courante et sur les données de la personne", async () => {
    await run("rooms.myReservations", viewerFor("MINISTER"));
    expect(prismaMock.roomReservation.findMany.mock.calls[0][0].where).toMatchObject({ churchId: "church-1", createdById: "user-1" });
    await run("accounting.myRequests", viewerFor("DEPARTMENT_HEAD"));
    expect(prismaMock.financialRequest.findMany.mock.calls[0][0].where).toMatchObject({ churchId: "church-1", submittedById: "user-1" });
  });

  it("donne le nom du remplaçant, sans autre information", async () => {
    const result = (await run("planning.myReplacements", viewerFor("STAR", { predicates: ["linkedStar"] }))) as DataAnswer;
    expect(result.items[0].detail).toBe("Remplacé par Léa B");
  });

  it("la navette se lit selon l'accès de l'écran Navette", async () => {
    expect(isDataRefusal(await run("shuttle.balance", viewerFor("ADMIN")))).toBe(true);
    const { getShuttleAccess } = await import("@/modules/shuttle");
    vi.mocked(getShuttleAccess).mockResolvedValueOnce({ manager: false, member: true } as never);
    expect(await run("shuttle.balance", viewerFor("STAR"))).toMatchObject({ items: [{ label: expect.stringContaining("120") }] });
  });
});
