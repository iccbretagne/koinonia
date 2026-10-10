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
  prismaMock.church.findUnique.mockResolvedValue({ name: "Rennes", primaryColor: "#123456" } as never);
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
