/**
 * Page /dashboard (grille par département) : redirections (vue pastorale, département par
 * défaut, visite guidée) et vue rendue selon ?view=. Composant serveur appelé directement.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import type { Session } from "next-auth";
import { createAdminSession, createDepartmentHeadSession, createSession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

const mockAuth = vi.fn();
const mockGetCurrentChurchId = vi.fn();
const mockRequireChurchPermission = vi.fn();
let viewModeCookie: string | undefined;
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  getCurrentChurchId: (...a: unknown[]) => mockGetCurrentChurchId(...a),
  requireChurchPermission: (...a: unknown[]) => mockRequireChurchPermission(...a),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => (viewModeCookie ? { value: viewModeCookie } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
// Composants clients : seul leur type et leurs props importent ici
for (const name of ["EventSelector", "PlanningGrid", "DashboardActions", "MonthlyPlanningView", "DepartmentTasksView", "WeeklyPlanningView", "TeamEventsView"]) {
  vi.doMock(`@/components/${name}`, () => ({ default: Object.assign(() => null, { displayName: name }) }));
}

const DashboardPage = (await import("../dashboard/page")).default;

function seen(session: Session): Session {
  return { ...session, user: { ...session.user, hasSeenTour: true } };
}

async function render(params: Record<string, string>) {
  return (await DashboardPage({ searchParams: Promise.resolve(params) })) as ReactElement<{ children: unknown[] }>;
}

/** Nom du composant affiché comme contenu principal, et ses props. */
async function content(params: Record<string, string>) {
  const page = await render(params);
  const main = page.props.children.at(-1) as ReactElement<Record<string, unknown>>;
  const type = main.type as { displayName?: string; name?: string };
  return { name: type.displayName ?? type.name, props: main.props };
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewModeCookie = undefined;
    mockGetCurrentChurchId.mockResolvedValue("church-1");
    mockAuth.mockResolvedValue(seen(createAdminSession()));
    prismaMock.church.findUnique.mockResolvedValue({ name: "Rennes" } as never);
    prismaMock.department.findUnique.mockResolvedValue({ name: "Choristes" } as never);
    prismaMock.department.findFirst.mockResolvedValue({ id: "d-first" } as never);
    prismaMock.event.findMany.mockResolvedValue([
      { id: "e1", title: "Culte", type: "CULTE", date: new Date("2026-03-01T10:00:00Z"), eventDepts: [{ departmentId: "d1", department: { name: "Son" } }] },
    ] as never);
  });

  it("redirige un visiteur non connecté", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(render({})).rejects.toThrow("REDIRECT:/");
  });

  it("redirige un pasteur vers sa vue, sauf choix explicite de la vue admin", async () => {
    mockAuth.mockResolvedValue(seen(createSession({ ...createAdminSession().user, pastoralChurchIds: ["church-1"] })));
    await expect(render({ dept: "d1" })).rejects.toThrow("REDIRECT:/pastoral");
    viewModeCookie = "admin";
    await expect(render({ dept: "d1" })).resolves.toBeDefined();
  });

  it("sans église courante, affiche un état vide", async () => {
    mockGetCurrentChurchId.mockResolvedValue(null);
    const page = await render({});
    expect((page.props as unknown as { title: string }).title).toBe("Aucune église");
  });

  it("choisit le premier département de l'église pour l'administration, en gardant la vue", async () => {
    await expect(render({ view: "month" })).rejects.toThrow("REDIRECT:/dashboard?dept=d-first&view=month");
  });

  it("choisit le premier département du responsable, et lance la visite guidée à la première venue", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([{ id: "d-own", name: "Own" }]));
    await expect(render({})).rejects.toThrow("REDIRECT:/dashboard?dept=d-own&tour=1");
  });

  it("transmet une visite demandée lors du choix du département", async () => {
    await expect(render({ tour: "admin" })).rejects.toThrow("REDIRECT:/dashboard?dept=d-first&tour=admin");
  });

  it("reste sur place sans département à proposer", async () => {
    prismaMock.department.findFirst.mockResolvedValue(null);
    expect((await content({})).name).toBe("SelectPrompt");
  });

  it("lance la visite guidée sur un département déjà choisi, en gardant événement et vue", async () => {
    mockAuth.mockResolvedValue(createAdminSession());
    await expect(render({ dept: "d1", event: "e1", view: "week" })).rejects.toThrow(
      "REDIRECT:/dashboard?dept=d1&event=e1&view=week&tour=1"
    );
  });

  it.each([
    ["week", "WeeklyPlanningView", { churchId: "church-1", departmentId: "d1", departmentName: "Choristes", churchName: "Rennes", canEdit: true }],
    ["tasks", "DepartmentTasksView", { departmentId: "d1", departmentName: "Choristes", readOnly: false }],
    ["month", "MonthlyPlanningView", { departmentId: "d1", departmentName: "Choristes", churchName: "Rennes" }],
    ["team", "TeamEventsView", { departmentId: "d1", departmentName: "Choristes", canEdit: true }],
  ])("vue %s : affiche %s", async (view, name, props) => {
    const result = await content({ dept: "d1", view });
    expect(result).toEqual({ name, props });
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
  });

  it("vue saisie : grille de l'événement choisi, titre tiré des événements", async () => {
    const page = await render({ dept: "d1", event: "e1" });
    const header = page.props.children[0] as ReactElement<{ title: string }>;
    expect(header.props.title).toBe("Son");
    expect(await content({ dept: "d1", event: "e1" })).toEqual({
      name: "PlanningGrid",
      props: { eventId: "e1", departmentId: "d1", readOnly: false },
    });
  });

  it("vue saisie sans événement : invite à choisir un événement", async () => {
    expect(await content({ dept: "d1" })).toEqual({ name: "SelectPrompt", props: { needsDepartment: false } });
  });

  it("une vue de département sans département invite à en choisir un", async () => {
    prismaMock.department.findFirst.mockResolvedValue(null);
    expect(await content({ view: "week" })).toEqual({ name: "SelectPrompt", props: { needsDepartment: true } });
  });

  it("lecture seule sans planning:edit, et sans nom d'église hors de ses rôles", async () => {
    mockAuth.mockResolvedValue(seen(createSession({
      churchRoles: [{ id: "r", churchId: "church-1", role: "SECRETARY", ministryId: null, church: { id: "church-1", name: "R", slug: "r" }, departments: [] }],
    })));
    expect((await content({ dept: "d1", view: "tasks" })).props.readOnly).toBe(true);
    mockGetCurrentChurchId.mockResolvedValue("church-2");
    expect((await content({ dept: "d1", view: "month" })).props.churchName).toBeUndefined();
  });
});
