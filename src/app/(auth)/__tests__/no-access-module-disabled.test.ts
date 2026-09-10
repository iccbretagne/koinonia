// Spec 038 (CA10) — un utilisateur dont TOUS les rôles ne portent que sur des modules
// désactivés conserve `churchRoles.length > 0` : le garde-fou de tête de AuthLayout (qui
// ne regarde que la présence de rôles) ne le voit pas. Le critère réel est « aucune entrée
// de navigation disponible », qui doit produire le même parcours « aucun accès » que
// l'utilisateur sans rôle du tout — sans écran ni message spécifique à la désactivation.
//
// `@/lib/registry` (donc `rolePermissions`) lit `process.env.ENABLED_MODULES` à
// l'import : chaque test réinitialise les modules et réimporte fraîchement.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockAuth = vi.fn();
const mockGetCurrentChurchId = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  signOut: vi.fn(),
  getCurrentChurchId: (...args: unknown[]) => mockGetCurrentChurchId(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

function accountantSession(churchId = "church-1") {
  return {
    user: {
      id: "user-1",
      email: "compta@example.com",
      name: "Comptable",
      displayName: null,
      image: null,
      isSuperAdmin: false,
      hasSeenTour: false,
      pastoralProfileId: null,
      pastoralChurchIds: [],
      churchRoles: [
        {
          id: "role-1",
          churchId,
          role: "ACCOUNTANT",
          ministryId: null,
          church: { id: churchId, name: "Test Church", slug: "test-church" },
          departments: [],
        },
      ],
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

describe("Parcours « aucun accès » sur modules désactivés (spec 038, CA10)", () => {
  const originalEnabledModules = process.env.ENABLED_MODULES;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentChurchId.mockResolvedValue("church-1");
    prismaMock.church.findUnique.mockResolvedValue({ name: "Test Church", primaryColor: "#5E17EB" } as never);
    prismaMock.department.findMany.mockResolvedValue([]);
    prismaMock.department.findFirst.mockResolvedValue(null);
    prismaMock.familyLeaderAssignment.count.mockResolvedValue(0);
    prismaMock.pastoralProfile.findFirst.mockResolvedValue(null);
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    if (originalEnabledModules === undefined) delete process.env.ENABLED_MODULES;
    else process.env.ENABLED_MODULES = originalEnabledModules;
  });

  it("redirige vers /no-access un Comptable dont le seul module (accounting) est désactivé", async () => {
    process.env.ENABLED_MODULES = "core,planning"; // ni accounting, ni jobs, ni audio
    vi.resetModules();
    mockAuth.mockResolvedValue(accountantSession());
    const AuthLayout = (await import("../layout")).default;

    await expect(AuthLayout({ children: null as never })).rejects.toThrow("REDIRECT:/no-access");
  });

  it("le même Comptable garde son accès quand accounting est actif (non-régression)", async () => {
    delete process.env.ENABLED_MODULES; // tous les modules actifs
    vi.resetModules();
    mockAuth.mockResolvedValue(accountantSession());
    const AuthLayout = (await import("../layout")).default;

    const element = await AuthLayout({ children: null as never });
    const props = (element as unknown as { props: Record<string, unknown> }).props;
    expect(props.hasAccounting).toBe(true);
  });
});
