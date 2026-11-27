/**
 * Instantané des props de navigation calculées par le layout authentifié, pour un éventail de
 * rôles et de situations (équipes de service, intégration, agenda, profil pastoral, plusieurs
 * églises). Filet de sécurité de tout remaniement du layout : la navigation ne doit pas bouger.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import {
  createSession,
  createSuperAdminSession,
  createAdminSession,
  createSecretarySession,
  createMinisterSession,
  createDepartmentHeadSession,
  createStarSession,
  createPastoralCareReferentSession,
  createProtocoleMemberSession,
} from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

const mockAuth = vi.fn();
const mockGetCurrentChurchId = vi.fn();
let viewModeCookie: string | undefined;
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  signOut: vi.fn(),
  getCurrentChurchId: (...args: unknown[]) => mockGetCurrentChurchId(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
// Entrée « Navette » (spec 073) : testée à part (navigation-shuttle.test.ts) ; ici, les
// départements du mock ne portent pas de fonction et la lecture serait trompeuse.
vi.mock("@/modules/shuttle/auth", () => ({ isShuttleVisible: vi.fn(async () => false) }));
vi.mock("@/modules/ticketing/auth", () => ({ isTicketingVisible: vi.fn(async () => false) }));
// Candidatures (spec 077) : seul le câblage du lien est vérifié ici ; les règles d'accès sont
// testées dans le module serving. Gestionnaires : Super Admin et Admin.
vi.mock("@/modules/serving/auth", () => ({
  servingActorFromSession: async (session: { user: { isSuperAdmin: boolean; churchRoles: { role: string }[] } }) => ({
    canManage: session.user.isSuperAdmin || session.user.churchRoles.some((r) => r.role === "ADMIN"),
  }),
}));
vi.mock("@/modules/serving", () => ({
  hasServingAccess: async (actor: { canManage: boolean }) => actor.canManage,
}));
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
  cookies: () =>
    Promise.resolve({ get: () => (viewModeCookie ? { value: viewModeCookie } : undefined), set: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const mockGetCareAccess = vi.fn();
vi.mock("@/modules/care", () => ({ getCareAccess: (...a: unknown[]) => mockGetCareAccess(...a) }));

const AuthLayout = (await import("../layout")).default;
const { buildSpaces } = await import("@/lib/navigation");
type NavigationInput = import("@/lib/navigation").NavigationInput;
const screensBefore = (await import("@/lib/__tests__/fixtures/screens-before.json")).default;

/** Props sérialisables passées à AuthLayoutShell (actions et éléments React écartés). */
async function navProps() {
  const element = await AuthLayout({ children: null as never });
  const props = (element as unknown as { props: Record<string, unknown> }).props;
  return Object.fromEntries(
    Object.entries(props).filter(([key, value]) => typeof value !== "function" && key !== "footer" && key !== "children")
  );
}

type ServiceDept = { id: string; function: string };

function world({
  serviceDepts = [] as ServiceDept[],
  integrationCount = 0,
  integrationHeadCount = 0,
  isBerger = false,
  ownProfile = false,
  memberLinked = false,
} = {}) {
  prismaMock.church.findUnique.mockResolvedValue({ name: "Rennes", primaryColor: "#123456" , logos: [] } as never);
  prismaMock.church.findMany.mockResolvedValue([{ id: "church-P", name: "Pastorale" }] as never);
  prismaMock.department.findMany.mockImplementation((async (args: { where: { function?: unknown } }) => {
    if (args.where.function) return serviceDepts;
    return [
      { id: "d-a", name: "Accueil", ministry: { name: "Service" } },
      { id: "d-b", name: "Choristes", ministry: { name: "Louange" } },
    ];
  }) as never);
  prismaMock.department.count.mockImplementation((async (args: { where: { function: unknown } }) =>
    args.where.function === "INTEGRATION" ? integrationHeadCount : integrationCount) as never);
  prismaMock.familyLeaderAssignment.count.mockResolvedValue(isBerger ? 1 : 0);
  prismaMock.pastoralProfile.findFirst.mockResolvedValue((ownProfile ? { id: "pp-1" } : null) as never);
  prismaMock.memberUserLink.findUnique.mockResolvedValue((memberLinked ? { id: "link" } : null) as never);
  mockGetCareAccess.mockResolvedValue({ ownProfileIds: [] });
}

function withRoles(base: Session, extra: Session["user"]["churchRoles"]): Session {
  return { ...base, user: { ...base.user, churchRoles: [...base.user.churchRoles, ...extra] } };
}

const otherChurchAdmin = {
  id: "role-x",
  churchId: "church-2",
  role: "ADMIN",
  ministryId: null,
  church: { id: "church-2", name: "Brest", slug: "brest" },
  departments: [],
} as Session["user"]["churchRoles"][number];

const scenarios: [string, () => Session, Parameters<typeof world>[0]?, string?][] = [
  ["Super Admin", () => createSuperAdminSession(), { serviceDepts: [{ id: "s", function: "SECRETARIAT" }] }],
  ["Admin, équipe Photos configurée", () => createAdminSession(), { serviceDepts: [{ id: "p", function: "PHOTOS" }], memberLinked: true }],
  ["Admin aussi Admin d'une autre église", () => withRoles(createAdminSession(), [otherChurchAdmin])],
  ["Secrétaire avec profil pastoral propre", () => createSecretarySession(), { ownProfile: true }],
  ["Ministre", () => createMinisterSession("min-1")],
  [
    "Resp. département Production Média et Intégration",
    () => createDepartmentHeadSession([{ id: "d-prod", name: "Prod" }, { id: "d-int", name: "Int" }]),
    {
      serviceDepts: [{ id: "d-prod", function: "PRODUCTION_MEDIA" }, { id: "d-int", function: "INTEGRATION" }],
      integrationCount: 1,
      integrationHeadCount: 1,
    },
  ],
  [
    "Resp. département Communication, Photos repliées sur Production Média",
    () => createDepartmentHeadSession([{ id: "d-com", name: "Com" }]),
    { serviceDepts: [{ id: "d-com", function: "COMMUNICATION" }, { id: "d-prod", function: "PRODUCTION_MEDIA" }] },
  ],
  ["STAR lié, berger de famille", () => createStarSession(), { memberLinked: true, isBerger: true }],
  ["STAR du Protocole", () => createProtocoleMemberSession("d-proto"), { serviceDepts: [{ id: "d-proto", function: "PROTOCOLE" }] }],
  ["Référent soins pastoraux", () => createPastoralCareReferentSession()],
  [
    "Comptable",
    () => createSession({
      churchRoles: [{ id: "r", churchId: "church-1", role: "ACCOUNTANT", ministryId: null, church: { id: "church-1", name: "Rennes", slug: "r" }, departments: [] }],
    }),
  ],
  ["Pasteur seul (profil pastoral, vue pastorale)", () => createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] }), { ownProfile: true }],
  [
    "Admin aussi pasteur, vue admin choisie",
    () => createSession({ ...createAdminSession().user, pastoralChurchIds: ["church-1", "church-P"] }),
    {},
    "admin",
  ],
];

/** Doublons pastoraux retirés au lot 3 (spec 092) : ancienne adresse → écran commun. */
const LOT3_PASTORAL_TWINS: Record<string, string> = {
  "/pastoral/events": "/events",
  "/pastoral/reports": "/admin/reports",
  "/pastoral/accounting": "/accounting/requests",
};

describe("AuthLayout — props de navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentChurchId.mockResolvedValue("church-1");
    viewModeCookie = undefined;
  });

  it.each(scenarios)("%s", async (_name, session, data, cookie) => {
    world(data);
    viewModeCookie = cookie;
    mockAuth.mockResolvedValue(session());
    expect(await navProps()).toMatchSnapshot();
  });

  // Invariance des droits (spec 092, lot 1) : la nouvelle navigation ne retire aucun écran à un profil.
  // Référence : `screens-before.json`, relevée sur le code d'avant le lot. Seul écart admis : les
  // demandes comptables du Ministre et du Resp. département (accounting:view sans manage) passent
  // du menu à une section de « Mes demandes ».
  it.each(scenarios)("invariance des écrans atteignables — %s", async (name, session, data, cookie) => {
    world(data);
    viewModeCookie = cookie;
    mockAuth.mockResolvedValue(session());
    const props = await navProps();
    const after = new Set(buildSpaces(props as unknown as NavigationInput).flatMap((sp) => sp.pages.map((pg) => pg.href)));
    const before = (screensBefore as Record<string, string[]>)[name];
    expect(before, `référence manquante pour ${name}`).toBeDefined();
    const missing = before.filter((href) => {
      if (after.has(href)) return false;
      const movedToMyRequests = href === "/accounting/requests" && !props.hasAccountingManage && after.has("/requests");
      // Lot 3 : le RDV pastoral passe par « Mes demandes » (ouverte à tous) ; les doublons
      // pastoraux redirigent vers les écrans communs, présents dans la navigation.
      const careViaMyRequests = href === "/care/request" && after.has("/requests");
      const pastoralTwin = LOT3_PASTORAL_TWINS[href];
      return !movedToMyRequests && !careViaMyRequests && !(pastoralTwin && after.has(pastoralTwin));
    });
    expect(missing).toEqual([]);
    // Aucune entrée nouvelle, hors : « Mes inscriptions », réglages de l'église du Super Admin, et
    // deux écrans déjà ouverts aux mêmes personnes (« Questionnaires » = `hasCampaigns`, absent de la
    // référence ; « Statistiques » = onglet de l'ancienne barre `AccountingNav`, même droit).
    // Lot 3 : « Mes demandes » pour tous (exception 1) ; lecture pastorale (exception 3).
    const isPastoralReader = ((session().user.pastoralChurchIds ?? []) as string[]).includes("church-1");
    const known = [
      "/collectes",
      "/accounting/stats",
      "/requests",
      // Vue pastorale = filtre de la navigation commune : Familles (site externe) en fait partie.
      ...(isPastoralReader ? ["/admin/reports", "/accounting/requests", "/events", props.famillesUrl as string] : []),
    ];
    const added = [...after].filter(
      (href) =>
        !before.includes(href) &&
        !known.includes(href) &&
        !href.startsWith("/admin/churches/") &&
        !href.startsWith("/billetterie/mes-") &&
        !href.startsWith("/formulaires/mes-")
    );
    expect(added).toEqual([]);

    // Libellés uniques par profil, Plateforme réservée au Super Admin, Suivi pastoral hors Personnes,
    // Finances sans entrée dans Demandes ni Administration (T1.14).
    const spaces = buildSpaces(props as unknown as NavigationInput);
    if (!props.isPastoral) {
      const labels = spaces.flatMap((sp) => sp.pages.filter((pg) => !pg.deptId).map((pg) => pg.label));
      expect(labels.filter((label, i) => labels.indexOf(label) !== i)).toEqual([]);
    }
    expect(spaces.some((sp) => sp.key === "platform")).toBe(name === "Super Admin");
    const hrefsOf = (key: string) => spaces.find((sp) => sp.key === key)?.pages.map((pg) => pg.href) ?? [];
    expect(hrefsOf("people")).not.toContain("/care");
    expect(hrefsOf("requests").filter((href) => href.startsWith("/accounting"))).toEqual([]);
    expect(hrefsOf("admin").filter((href) => href.startsWith("/accounting") || href === "/dons")).toEqual([]);
  });

  it("assignee d'un suivi pastoral sans care:view : lien « Suivi pastoral »", async () => {
    world();
    mockGetCareAccess.mockResolvedValue({ ownProfileIds: ["pp-1"] });
    mockAuth.mockResolvedValue(createStarSession());
    const props = await navProps();
    expect(props.agendaLinks).toContainEqual({ href: "/care", label: "Suivi pastoral" });
  });

  it("sans église courante, ni départements d'admin ni sections d'église", async () => {
    world();
    mockGetCurrentChurchId.mockResolvedValue(null);
    mockAuth.mockResolvedValue(createSuperAdminSession());
    expect(await navProps()).toMatchSnapshot();
  });

  it("sans église courante, un responsable sans autre accès est renvoyé vers /no-access", async () => {
    world();
    mockGetCurrentChurchId.mockResolvedValue(null);
    mockAuth.mockResolvedValue(createDepartmentHeadSession([{ id: "d-a", name: "A" }]));
    await expect(navProps()).rejects.toThrow("REDIRECT:/no-access");
  });

  it("redirige un visiteur non connecté, et un compte sans rôle ni profil pastoral", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(navProps()).rejects.toThrow("REDIRECT:/");
    mockAuth.mockResolvedValue(createSession({ churchRoles: [] }));
    await expect(navProps()).rejects.toThrow("REDIRECT:/no-access");
  });
});
