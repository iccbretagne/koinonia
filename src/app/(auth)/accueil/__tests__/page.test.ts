/**
 * Accueil « Aujourd'hui » : rendu HTML complet figé pour plusieurs profils (services, agenda,
 * demandes, raccourcis). Filet de sécurité d'un remaniement sans changement visuel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

let granted = new Set<string>();
const mockGetCurrentChurchId = vi.fn();
const mockSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: () => mockSession(),
  getCurrentChurchId: (...a: unknown[]) => mockGetCurrentChurchId(...a),
  requireChurchPermission: async (permission: string) => {
    if (!granted.has(permission)) throw new Error("FORBIDDEN");
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/registry", () => ({ registry: { has: () => true } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));
vi.mock("../../planning/MyPlanningView", () => ({
  NextServiceCard: ({ planning, tasks }: Readonly<{ planning: { id: string }; tasks: unknown[] }>) =>
    createElement("div", { "data-next-service": planning.id, "data-tasks": tasks.length }),
}));
const mockLoadMyPlanning = vi.fn();
vi.mock("../../planning/my-planning-data", () => ({ loadMyPlanning: (...a: unknown[]) => mockLoadMyPlanning(...a) }));
const mockLoadMyRequests = vi.fn();
vi.mock("../../requests/my-requests-data", () => ({ loadMyRequests: (...a: unknown[]) => mockLoadMyRequests(...a) }));
vi.mock("@/modules/planning", () => ({
  getStaffingGapViewer: async () => ({ viewer: true }),
  countUnstaffedDepartments: async () => new Map([["ev-1", 2]]),
}));

const TodayPage = (await import("../page")).default;

const at = (day: number, hour = 10) => new Date(2026, 2, day, hour, 0, 0);

function planning(id: string, day: number, status = "EN_SERVICE") {
  return {
    id,
    status,
    eventDepartment: {
      event: { id: `ev-${id}`, title: `Culte ${day}`, date: at(day) },
      department: { id: "d1", name: "Son" },
    },
  };
}

const myPlanning = {
  member: { firstName: "anne-marie" },
  plannings: [planning("p-past", 1), planning("p2", 12, "EN_SERVICE_DEBRIEF"), planning("p1", 8)],
  teamEvents: [
    { id: "t1", title: "Répétition", startsAt: at(10, 19), endsAt: at(10, 21), location: "Salle 2", department: { name: "Choristes" } },
    { id: "t2", title: "Réunion", startsAt: at(11, 19), endsAt: at(11, 21), location: null, department: { name: "Son" } },
    { id: "t-old", title: "Passée", startsAt: at(2, 19), endsAt: at(2, 21), location: null, department: { name: "Son" } },
  ],
  tasksByEvent: { "ev-p1_d1": [{ id: "task" }] },
  withdrawals: [],
  contactsByDepartment: {},
};

function request(id: string, status: string, announcement: string | null = null) {
  return { id, status, type: "VISUEL", title: `Demande ${id}`, announcement: announcement ? { title: announcement } : null, submittedAt: at(3) };
}

async function html() {
  return renderToStaticMarkup((await TodayPage()) as never);
}

describe("TodayPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(at(5, 9));
    mockGetCurrentChurchId.mockResolvedValue("church-1");
    mockSession.mockResolvedValue(createSession({ name: "Jean Dupont" }));
    prismaMock.church.findUnique.mockResolvedValue({ name: "Rennes" } as never);
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    prismaMock.event.findMany.mockResolvedValue([
      { id: "ev-1", title: "Culte", type: "CULTE", date: at(8) },
      { id: "ev-2", title: "Prière", type: "PRIERE", date: at(9, 20) },
    ] as never);
    mockLoadMyPlanning.mockResolvedValue(myPlanning);
    mockLoadMyRequests.mockResolvedValue([
      request("r1", "EN_ATTENTE"),
      request("r2", "EN_COURS", "Annonce Noël"),
      request("r3", "APPROUVEE"),
      request("r4", "EN_ATTENTE"),
      request("r5", "EN_COURS"),
      request("r6", "EN_COURS"),
      request("r7", "REFUSEE"),
    ]);
  });
  afterEach(() => vi.useRealTimers());

  it("sans église courante, invite à en choisir une", async () => {
    mockGetCurrentChurchId.mockResolvedValue(null);
    expect(await html()).toContain("Aucune église sélectionnée");
  });

  it("responsable avec tous les accès", async () => {
    granted = new Set(["planning:view", "planning:department", "events:view", "members:view", "audio:listen"]);
    expect(await html()).toMatchSnapshot();
  });

  it("STAR : semaine de l'église, aucun service à venir, prénom du profil", async () => {
    granted = new Set(["planning:view"]);
    mockLoadMyPlanning.mockResolvedValue({ ...myPlanning, member: null, plannings: [planning("p-past", 1)], teamEvents: [] });
    mockSession.mockResolvedValue(createSession({ name: "Luc", displayName: "Lucas" }));
    expect(await html()).toMatchSnapshot();
  });

  it("STAR sans fiche liée ni événement cette semaine", async () => {
    granted = new Set(["planning:view"]);
    mockLoadMyPlanning.mockResolvedValue(null);
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ member: { firstName: "Zoé" } } as never);
    prismaMock.event.findMany.mockResolvedValue([] as never);
    expect(await html()).toMatchSnapshot();
  });

  it("événements et demandes sans service : aucune demande ouverte, aucun événement à venir", async () => {
    granted = new Set(["events:view", "members:view"]);
    mockLoadMyRequests.mockResolvedValue([request("r7", "REFUSEE")]);
    prismaMock.event.findMany.mockResolvedValue([] as never);
    mockSession.mockResolvedValue(createSession({ name: null }));
    expect(await html()).toMatchSnapshot();
  });

  it("compte sans permission : seulement le profil", async () => {
    granted = new Set();
    mockSession.mockResolvedValue(createSession({ name: null }));
    expect(await html()).toMatchSnapshot();
  });
});
