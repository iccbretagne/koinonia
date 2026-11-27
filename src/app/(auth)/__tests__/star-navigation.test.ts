// Spec 031/#462, T29 — le STAR perd l'entrée de sidebar "Planning" (grille par
// département, /dashboard) mais conserve "Mon planning", les événements STAR et
// l'auto-déclaration d'absence, tous dérivés de planning:view (jamais retiré au STAR).
// Sans ce test, une régression future sur la dissociation faite en T17 (hasPlanningAccess
// vs. hasMyPlanning/showStarEvents) ne serait détectée par aucun autre test.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSession, createStarSession, createAdminSession, createDepartmentHeadSession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

const mockAuth = vi.fn();
const mockGetCurrentChurchId = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  signOut: vi.fn(),
  getCurrentChurchId: (...args: unknown[]) => mockGetCurrentChurchId(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
// Règle de lecture de la trame (#676) : on ne vérifie ici que son câblage dans le layout ; la
// règle elle-même est testée dans le module planning. Lecteurs : tout rôle sauf STAR/Reporter.
const mockCanReadAnnouncementSheet = vi.fn(async (session: { user: { isSuperAdmin: boolean; churchRoles: { role: string }[] } }) =>
  session.user.isSuperAdmin || session.user.churchRoles.some((r) => !["STAR", "REPORTER"].includes(r.role))
);
vi.mock("@/modules/planning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/planning")>()),
  canReadAnnouncementSheet: (...args: Parameters<typeof mockCanReadAnnouncementSheet>) => mockCanReadAnnouncementSheet(...args),
}));
vi.mock("next/headers", () => ({
  // En-tête du proxy absent : la garde d'adresse (page-gates.ts) ne s'applique pas.
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`UNEXPECTED_REDIRECT:${url}`);
  },
}));

const AuthLayout = (await import("../layout")).default;

function shellProps(element: Awaited<ReturnType<typeof AuthLayout>>) {
  // AuthLayout renvoie <AuthLayoutShell {...props}>{children}</AuthLayoutShell>
  return (element as unknown as { props: Record<string, unknown> }).props;
}

describe("Navigation STAR après spec 031/#462 (T29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentChurchId.mockResolvedValue("church-1");
    prismaMock.church.findUnique.mockResolvedValue({ name: "Test Church", primaryColor: "#5E17EB" , logos: [] } as never);
    prismaMock.department.findMany.mockResolvedValue([]);
    prismaMock.department.findFirst.mockResolvedValue(null);
    prismaMock.familyLeaderAssignment.count.mockResolvedValue(0);
    prismaMock.pastoralProfile.findFirst.mockResolvedValue(null);
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ id: "link-1" } as never);
  });

  it("un STAR n'a pas hasPlanningAccess (entrée « Planning » masquée, /dashboard hors périmètre)", async () => {
    mockAuth.mockResolvedValue(createStarSession("church-1"));
    const element = await AuthLayout({ children: null as never });
    expect(shellProps(element).hasPlanningAccess).toBe(false);
  });

  it("un STAR conserve hasMyPlanning (« Mon planning »), car dérivé de planning:view", async () => {
    mockAuth.mockResolvedValue(createStarSession("church-1"));
    const element = await AuthLayout({ children: null as never });
    expect(shellProps(element).hasMyPlanning).toBe(true);
  });

  it("un STAR conserve showStarEvents (vue événements hebdomadaire)", async () => {
    mockAuth.mockResolvedValue(createStarSession("church-1"));
    const element = await AuthLayout({ children: null as never });
    expect(shellProps(element).showStarEvents).toBe(true);
  });

  it("un STAR lié à un membre a « Disponibilités » mais pas « Indisponibilités »", async () => {
    mockAuth.mockResolvedValue(createStarSession("church-1"));
    const element = await AuthLayout({ children: null as never });
    expect(shellProps(element).hasAvailability).toBe(true);
    expect(shellProps(element).hasAbsences).toBe(false);
  });

  it("#676 : un STAR sans droit de lecture n'a pas « Trame des annonces »", async () => {
    mockAuth.mockResolvedValue(createStarSession("church-1"));
    const element = await AuthLayout({ children: null as never });
    expect(shellProps(element).hasAnnouncementSheet).toBe(false);
  });

  it("#676 : un STAR de la modération (lecteur) a « Trame des annonces »", async () => {
    mockAuth.mockResolvedValue(createStarSession("church-1"));
    mockCanReadAnnouncementSheet.mockResolvedValueOnce(true);
    const element = await AuthLayout({ children: null as never });
    expect(shellProps(element).hasAnnouncementSheet).toBe(true);
  });

  it("#676 : un Reporter (events:view sans planning:view) n'a pas « Trame des annonces », règle non évaluée", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [{ ...createStarSession("church-1").user.churchRoles[0], role: "REPORTER" }] }));
    mockCanReadAnnouncementSheet.mockResolvedValue(true);
    const element = await AuthLayout({ children: null as never });
    expect(shellProps(element).hasAnnouncementSheet).toBe(false);
    expect(mockCanReadAnnouncementSheet).not.toHaveBeenCalled();
  });

  it("un Admin conserve hasPlanningAccess (planning:department accordé)", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    const element = await AuthLayout({ children: null as never });
    expect(shellProps(element).hasPlanningAccess).toBe(true);
  });
});

// Spec 092, lot 3 (exceptions 1 et 2) — « Mes demandes » est ouverte à tout compte de l'église
// et porte « Demander un rendez-vous » : plus de lien de menu autonome, pour personne.
describe("« Mes demandes » et RDV pastoral après spec 092 (lot 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentChurchId.mockResolvedValue("church-1");
    prismaMock.church.findUnique.mockResolvedValue({ name: "Test Church", primaryColor: "#5E17EB" , logos: [] } as never);
    prismaMock.department.findMany.mockResolvedValue([]);
    prismaMock.department.findFirst.mockResolvedValue(null);
    prismaMock.familyLeaderAssignment.count.mockResolvedValue(0);
    prismaMock.pastoralProfile.findFirst.mockResolvedValue(null);
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ id: "link-1" } as never);
  });

  it.each([
    ["STAR", () => createStarSession("church-1")],
    ["Reporter", () => createSession({ churchRoles: [{ id: "r", churchId: "church-1", role: "REPORTER", ministryId: null, church: { id: "church-1", name: "É", slug: "e" }, departments: [] }] } as never)],
    ["Comptable", () => createSession({ churchRoles: [{ id: "r", churchId: "church-1", role: "ACCOUNTANT", ministryId: null, church: { id: "church-1", name: "É", slug: "e" }, departments: [] }] } as never)],
    ["Référent soins pastoraux", () => createSession({ churchRoles: [{ id: "r", churchId: "church-1", role: "PASTORAL_CARE_REFERENT", ministryId: null, church: { id: "church-1", name: "É", slug: "e" }, departments: [] }] } as never)],
  ])("%s : « Mes demandes » en tête, sans lien RDV autonome", async (_name, session) => {
    mockAuth.mockResolvedValue(session());
    const element = await AuthLayout({ children: null as never });
    const requestLinks = shellProps(element).requestLinks as { href: string; label: string }[];
    expect(requestLinks[0]).toEqual({ href: "/demandes", label: "Mes demandes" });
    expect(requestLinks).not.toContainEqual({ href: "/demandes/rendez-vous", label: "Demander un rendez-vous" });
  });

  it("un Admin (members:view) n'a pas de lien autonome", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    const element = await AuthLayout({ children: null as never });
    const requestLinks = shellProps(element).requestLinks as { href: string; label: string }[];
    expect(requestLinks).not.toContainEqual({ href: "/demandes/rendez-vous", label: "Demander un rendez-vous" });
  });
});

// Spec 043 — Visuels / Communication / Événements / Projets / Collections deviennent un seul
// lien de menu « Communication & Production », les onglets réels dépendant de l'équipe.
describe("Espace « Communication & Production » après spec 043", () => {
  const PROD_MEDIA_DEPT = { id: "dept-prod-media", name: "Production Média", function: "PRODUCTION_MEDIA" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentChurchId.mockResolvedValue("church-1");
    prismaMock.church.findUnique.mockResolvedValue({ name: "Test Church", primaryColor: "#5E17EB" , logos: [] } as never);
    prismaMock.department.findFirst.mockResolvedValue(null);
    prismaMock.familyLeaderAssignment.count.mockResolvedValue(0);
    prismaMock.pastoralProfile.findFirst.mockResolvedValue(null);
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ id: "link-1" } as never);
  });

  it("un membre Production média a une seule entrée « Communication & Production », plus aucun lien Visuels/Projets/Collections séparé", async () => {
    prismaMock.department.findMany.mockResolvedValue([PROD_MEDIA_DEPT] as never);
    mockAuth.mockResolvedValue(createDepartmentHeadSession([PROD_MEDIA_DEPT], "church-1"));
    const element = await AuthLayout({ children: null as never });
    const mediaLinks = shellProps(element).mediaLinks as { href: string; label: string }[];
    expect(mediaLinks).toContainEqual(
      expect.objectContaining({ href: "/medias", label: "Communication & Production" })
    );
    expect(mediaLinks.find((l) => l.href === "/medias/visuels/demandes")).toBeUndefined();
    expect(mediaLinks.find((l) => l.href === "/medias/visuels")).toBeUndefined();
    expect(mediaLinks.find((l) => l.href === "/medias/partages")).toBeUndefined();
    expect(mediaLinks.find((l) => l.href === "/medias/reseaux-sociaux")).toBeUndefined();
  });

  it("un utilisateur sans droit média n'a pas l'entrée « Communication & Production »", async () => {
    prismaMock.department.findMany.mockResolvedValue([]);
    mockAuth.mockResolvedValue(createStarSession("church-1"));
    const element = await AuthLayout({ children: null as never });
    const mediaLinks = shellProps(element).mediaLinks as { href: string; label: string }[];
    expect(mediaLinks.find((l) => l.href === "/medias")).toBeUndefined();
  });

  it("Audio reste présent et distinct de « Communication & Production »", async () => {
    prismaMock.department.findMany.mockResolvedValue([PROD_MEDIA_DEPT] as never);
    mockAuth.mockResolvedValue(createDepartmentHeadSession([PROD_MEDIA_DEPT], "church-1"));
    const element = await AuthLayout({ children: null as never });
    const mediaLinks = shellProps(element).mediaLinks as { href: string; label: string }[];
    expect(mediaLinks).toContainEqual({ href: "/medias/audio", label: "Audio" });
  });
});
