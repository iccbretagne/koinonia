// Spec 045 — L'équipe Secrétariat porte les droits du Secrétariat (étape 1/2).
//
// Un membre d'un département de fonction Secrétariat doit obtenir, via une entrée de
// rôle SECRETARY synthétique injectée dans le callback `session`, une parité totale
// avec le rôle Secrétaire réel — sans qu'aucune ligne `UserChurchRole` n'existe. Ces
// tests couvrent : la résolution de l'entrée synthétique (callback session), la parité
// de permissions, les périmètres de portée, la non-régression des refus, et l'anti-escalade.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createSession,
  createSecretarySession,
  createSecretariatTeamSession,
  createStarSession,
  createDepartmentHeadSession,
  createMinisterSession,
} from "@/__mocks__/auth";
import { rolePermissions } from "@/lib/registry";

const mockNextAuthFactory = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    mockNextAuthFactory(config);
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));

const authModule = await import("@/lib/auth");
const {
  requireChurchPermission,
  getUserDepartmentScope,
  getUserMinistryScope,
  getDiscipleshipScope,
} = authModule;

// `auth` est déjà le `vi.fn()` renvoyé par le factory `next-auth` mocké ci-dessus (même
// référence utilisée en interne par `requireAuth`/`requireChurchPermission`) : on pilote
// directement ce mock plutôt que d'en créer un spy sur un export en lecture seule (ESM).
const mockAuth = authModule.auth as unknown as ReturnType<typeof vi.fn>;

// Le callback `session` n'est pas exporté : on le récupère depuis la configuration
// passée au factory `NextAuth(...)`, capturée par le mock ci-dessus au chargement
// du module (import statique en tête de `auth.ts`).
type SessionCallback = (args: {
  session: Awaited<ReturnType<typeof createSession>>;
  user: { id: string; email?: string | null };
}) => Promise<Awaited<ReturnType<typeof createSession>>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nextAuthConfig = mockNextAuthFactory.mock.calls[0][0] as any;
const sessionCallback: SessionCallback = nextAuthConfig.callbacks.session;

const CHURCH_A = "church-A";
const CHURCH_B = "church-B";
const USER_ID = "user-secretariat-1";

function baseSessionShell(): Awaited<ReturnType<typeof createSession>> {
  return {
    user: {
      id: "",
      email: "person@example.com",
      name: null,
      displayName: null,
      image: null,
      isSuperAdmin: false,
      hasSeenTour: false,
      pastoralProfileId: null,
      pastoralChurchIds: [],
      churchRoles: [],
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

/** Configure les mocks prisma pour un utilisateur avec un rôle STAR dans `churchId`. */
function mockStarUser(opts: {
  churchId: string;
  departmentFunction?: string | null;
  hasMemberLink?: boolean;
}) {
  const { churchId, departmentFunction = null, hasMemberLink = true } = opts;

  prismaMock.user.findUnique.mockResolvedValue({
    displayName: "Personne Test",
    isSuperAdmin: false,
    hasSeenTour: true,
  });

  prismaMock.userChurchRole.findMany.mockResolvedValue([
    {
      id: "role-star-1",
      churchId,
      role: "STAR",
      ministryId: null,
      ministry: null,
      church: { id: churchId, name: "Église Test", slug: "eglise-test" },
      departments: [],
    },
  ]);

  prismaMock.memberUserLink.findUnique.mockImplementation(
    async ({ where }: { where: { userId_churchId: { userId: string; churchId: string } } }) => {
      if (!hasMemberLink || where.userId_churchId.churchId !== churchId) return null;
      return {
        member: {
          departments: departmentFunction
            ? [
                {
                  department: {
                    id: "dept-secretariat",
                    name: "Secrétariat",
                    function: departmentFunction,
                  },
                },
              ]
            : [],
        },
      };
    }
  );

  prismaMock.pastoralProfile.findMany.mockResolvedValue([]);
}

describe("callback session — résolution de l'équipe Secrétariat (spec 045, T11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ajoute une entrée SECRETARY synthétique pour un membre d'un département Secrétariat", async () => {
    mockStarUser({ churchId: CHURCH_A, departmentFunction: "SECRETARIAT" });

    const result = await sessionCallback({ session: baseSessionShell(), user: { id: USER_ID } });

    const synthetic = result.user.churchRoles.find(
      (r) => r.churchId === CHURCH_A && r.role === "SECRETARY"
    );
    expect(synthetic).toBeDefined();
    expect(synthetic?.virtual).toBe(true);
  });

  it("n'ajoute rien pour un membre d'un département d'une autre fonction", async () => {
    mockStarUser({ churchId: CHURCH_A, departmentFunction: "PROTOCOLE" });

    const result = await sessionCallback({ session: baseSessionShell(), user: { id: USER_ID } });

    expect(result.user.churchRoles.some((r) => r.role === "SECRETARY")).toBe(false);
  });

  it("n'ajoute rien pour un compte sans fiche STAR liée", async () => {
    mockStarUser({ churchId: CHURCH_A, departmentFunction: "SECRETARIAT", hasMemberLink: false });

    const result = await sessionCallback({ session: baseSessionShell(), user: { id: USER_ID } });

    expect(result.user.churchRoles.some((r) => r.role === "SECRETARY")).toBe(false);
  });

  it("cloisonne par église : l'appartenance en A n'ouvre rien en B", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      displayName: "Personne Test",
      isSuperAdmin: false,
      hasSeenTour: true,
    });
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      {
        id: "role-star-a",
        churchId: CHURCH_A,
        role: "STAR",
        ministryId: null,
        ministry: null,
        church: { id: CHURCH_A, name: "Église A", slug: "eglise-a" },
        departments: [],
      },
      {
        id: "role-star-b",
        churchId: CHURCH_B,
        role: "STAR",
        ministryId: null,
        ministry: null,
        church: { id: CHURCH_B, name: "Église B", slug: "eglise-b" },
        departments: [],
      },
    ]);
    prismaMock.memberUserLink.findUnique.mockImplementation(
      async ({ where }: { where: { userId_churchId: { userId: string; churchId: string } } }) => {
        if (where.userId_churchId.churchId !== CHURCH_A) return null;
        return {
          member: {
            departments: [
              { department: { id: "dept-secretariat", name: "Secrétariat", function: "SECRETARIAT" } },
            ],
          },
        };
      }
    );
    prismaMock.pastoralProfile.findMany.mockResolvedValue([]);

    const result = await sessionCallback({ session: baseSessionShell(), user: { id: USER_ID } });

    expect(result.user.churchRoles.some((r) => r.churchId === CHURCH_A && r.role === "SECRETARY")).toBe(true);
    expect(result.user.churchRoles.some((r) => r.churchId === CHURCH_B && r.role === "SECRETARY")).toBe(false);
  });

  it("n'ajoute pas de doublon si un rôle SECRETARY réel existe déjà pour cette église", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      displayName: "Secrétaire Test",
      isSuperAdmin: false,
      hasSeenTour: true,
    });
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      {
        id: "role-secretary-real",
        churchId: CHURCH_A,
        role: "SECRETARY",
        ministryId: null,
        ministry: null,
        church: { id: CHURCH_A, name: "Église A", slug: "eglise-a" },
        departments: [],
      },
      {
        id: "role-star-a",
        churchId: CHURCH_A,
        role: "STAR",
        ministryId: null,
        ministry: null,
        church: { id: CHURCH_A, name: "Église A", slug: "eglise-a" },
        departments: [],
      },
    ]);
    prismaMock.memberUserLink.findUnique.mockResolvedValue({
      member: {
        departments: [
          { department: { id: "dept-secretariat", name: "Secrétariat", function: "SECRETARIAT" } },
        ],
      },
    });
    prismaMock.pastoralProfile.findMany.mockResolvedValue([]);

    const result = await sessionCallback({ session: baseSessionShell(), user: { id: USER_ID } });

    const secretaryEntries = result.user.churchRoles.filter(
      (r) => r.churchId === CHURCH_A && r.role === "SECRETARY"
    );
    expect(secretaryEntries).toHaveLength(1);
    expect(secretaryEntries[0].virtual).toBeUndefined();
  });
});

describe("parité de permissions — équipe Secrétariat = rôle Secrétaire (T12)", () => {
  const secretaryPermissions = rolePermissions.SECRETARY ?? [];

  it("liste au moins une permission à couvrir (garde contre un manifeste vidé par erreur)", () => {
    expect(secretaryPermissions.length).toBeGreaterThan(0);
  });

  it.each(secretaryPermissions)(
    "un membre de l'équipe obtient la permission %s comme un Secrétaire",
    async (permission) => {
      const churchId = "church-parity";
      mockAuth.mockResolvedValue(createSecretariatTeamSession(churchId));

      await expect(requireChurchPermission(permission, churchId)).resolves.toBeDefined();
    }
  );
});

describe("périmètres — non scopé pour l'équipe Secrétariat (T13)", () => {
  it("getUserDepartmentScope renvoie { scoped: false }", () => {
    const session = createSecretariatTeamSession("church-scope");
    expect(getUserDepartmentScope(session, "church-scope")).toEqual({ scoped: false });
  });

  it("getUserMinistryScope renvoie { scoped: false }", () => {
    const session = createSecretariatTeamSession("church-scope");
    expect(getUserMinistryScope(session, "church-scope")).toEqual({ scoped: false });
  });

  it("getDiscipleshipScope renvoie { scoped: false }", async () => {
    const session = createSecretariatTeamSession("church-scope");
    await expect(getDiscipleshipScope(session, "church-scope")).resolves.toEqual({ scoped: false });
  });
});

describe("non-régression — les refus existants restent en place (T14)", () => {
  const churchId = "church-refus";

  it.each([
    ["STAR d'un autre département", createStarSession(churchId)],
    ["Responsable de département", createDepartmentHeadSession([{ id: "d1", name: "Dept" }], churchId)],
    ["Ministre", createMinisterSession("ministry-1", churchId)],
  ] as const)("%s reste refusé sur events:manage", async (_label, session) => {
    mockAuth.mockResolvedValue(session);

    await expect(requireChurchPermission("events:manage", churchId)).rejects.toThrow("FORBIDDEN");
  });
});

describe("anti-escalade — l'équipe Secrétariat n'obtient jamais plus qu'un Secrétaire (T15)", () => {
  it("un membre de l'équipe et un Secrétaire réel obtiennent le même verdict sur access:manage", async () => {
    const churchId = "church-anti-escalade";
    mockAuth.mockResolvedValue(createSecretariatTeamSession(churchId));
    await expect(requireChurchPermission("access:manage", churchId)).resolves.toBeDefined();

    mockAuth.mockResolvedValue(createSecretarySession(churchId));
    await expect(requireChurchPermission("access:manage", churchId)).resolves.toBeDefined();
  });

  it("l'équipe Secrétariat n'obtient jamais church:manage ou users:manage (réservés Super Admin)", async () => {
    const churchId = "church-anti-escalade-2";
    mockAuth.mockResolvedValue(createSecretariatTeamSession(churchId));

    await expect(requireChurchPermission("church:manage", churchId)).rejects.toThrow("FORBIDDEN");
    await expect(requireChurchPermission("users:manage", churchId)).rejects.toThrow("FORBIDDEN");
  });
});
