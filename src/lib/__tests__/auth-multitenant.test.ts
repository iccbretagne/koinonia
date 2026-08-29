// Spec 024 — Isolation inter-églises des contrôles de permission (audit H-01).
//
// Ces tests couvrent spécifiquement `requireCurrentChurchPermission`, le remplaçant de
// l'ancien `requirePermission(permission)` sans église : il résout le contexte d'église
// courant (cookie `current-church`, potentiellement manipulé par le client) PUIS vérifie
// la permission dans CETTE église — jamais l'inverse.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession, createSuperAdminSession } from "@/__mocks__/auth";

const mockAuth = vi.fn();
const mockCookieGet = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => mockCookieGet(name) }),
}));

const { requireCurrentChurchPermission, requireChurchPermission } =
  await import("@/lib/auth");

/** Session avec un rôle privilégié dans A et un rôle moindre dans B. */
function multiChurchSession() {
  return createSession({
    churchRoles: [
      {
        id: "role-a",
        churchId: "church-A",
        role: "ADMIN",
        ministryId: null,
        church: { id: "church-A", name: "Église A", slug: "eglise-a" },
        departments: [],
      },
      {
        id: "role-b",
        churchId: "church-B",
        role: "STAR",
        ministryId: null,
        church: { id: "church-B", name: "Église B", slug: "eglise-b" },
        departments: [],
      },
    ],
  });
}

function setCurrentChurchCookie(churchId: string | undefined) {
  mockCookieGet.mockImplementation((name: string) =>
    name === "current-church" && churchId ? { value: churchId } : undefined
  );
}

describe("requireCurrentChurchPermission — isolation inter-églises (T12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse dans B une permission détenue seulement dans A (écriture)", async () => {
    mockAuth.mockResolvedValue(multiChurchSession());
    setCurrentChurchCookie("church-B");

    await expect(
      requireCurrentChurchPermission("members:manage")
    ).rejects.toThrow("FORBIDDEN");
  });

  it("refuse dans B une permission détenue seulement dans A (lecture)", async () => {
    mockAuth.mockResolvedValue(multiChurchSession());
    setCurrentChurchCookie("church-B");

    // members:view est accordé à ADMIN mais pas à STAR.
    await expect(
      requireCurrentChurchPermission("members:view")
    ).rejects.toThrow("FORBIDDEN");
  });

  it("autorise la même permission une fois le contexte basculé sur A", async () => {
    mockAuth.mockResolvedValue(multiChurchSession());
    setCurrentChurchCookie("church-A");

    const { churchId } = await requireCurrentChurchPermission("members:manage");
    expect(churchId).toBe("church-A");
  });
});

describe("requireCurrentChurchPermission — non-régression mono-église (T13)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("conserve exactement ses accès pour une session à une seule église", async () => {
    mockAuth.mockResolvedValue(createSession()); // ADMIN de church-1 uniquement
    setCurrentChurchCookie(undefined); // aucun cookie : retombe sur l'unique église

    const { churchId } = await requireCurrentChurchPermission("members:manage");
    expect(churchId).toBe("church-1");
  });
});

describe("requireCurrentChurchPermission — Super Admin (T14)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("conserve l'accès global quel que soit le contexte d'église", async () => {
    mockAuth.mockResolvedValue(createSuperAdminSession());
    setCurrentChurchCookie("church-999");

    await expect(
      requireCurrentChurchPermission("church:manage")
    ).resolves.toBeDefined();
  });
});

describe("requireChurchPermission — supervision pastorale en lecture seule (T15)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("autorise la lecture sur l'église supervisée", async () => {
    mockAuth.mockResolvedValue(
      createSession({ churchRoles: [], pastoralChurchIds: ["church-B"] })
    );

    await expect(
      requireChurchPermission("members:view", "church-B")
    ).resolves.toBeDefined();
  });

  it("refuse l'écriture sur l'église supervisée, même avec un rôle privilégié ailleurs", async () => {
    // Le cas le plus exposé (cf. plan.md « Risques ») : un profil pastoral supervisant B,
    // par ailleurs ADMIN de A. La supervision ne doit JAMAIS ouvrir l'écriture sur B.
    mockAuth.mockResolvedValue(
      createSession({
        pastoralChurchIds: ["church-B"],
        churchRoles: [
          {
            id: "role-a",
            churchId: "church-A",
            role: "ADMIN",
            ministryId: null,
            church: { id: "church-A", name: "Église A", slug: "eglise-a" },
            departments: [],
          },
        ],
      })
    );

    await expect(
      requireChurchPermission("members:manage", "church-B")
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("requireCurrentChurchPermission — contexte manipulé (T16)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignore un cookie d'église sans rattachement : ne devient jamais le périmètre de l'action", async () => {
    mockAuth.mockResolvedValue(createSession()); // rôle uniquement dans church-1
    setCurrentChurchCookie("church-sans-rattachement");

    const { churchId } = await requireCurrentChurchPermission("members:manage");
    // getCurrentChurchId ignore la valeur manipulée et retombe sur la seule église
    // où la session a un rattachement légitime.
    expect(churchId).toBe("church-1");
    expect(churchId).not.toBe("church-sans-rattachement");
  });
});

describe("requireChurchPermission — absence de fuite d'information (T17)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("le refus dans B est indiscernable du refus opposé à une session sans aucun droit", async () => {
    const noRightsAnywhere = createSession({ churchRoles: [] });
    const rightsOnlyInA = multiChurchSession();

    let errorNoRights: unknown;
    let errorWrongChurch: unknown;

    mockAuth.mockResolvedValue(noRightsAnywhere);
    try {
      await requireChurchPermission("members:manage", "church-B");
    } catch (e) {
      errorNoRights = e;
    }

    mockAuth.mockResolvedValue(rightsOnlyInA);
    try {
      await requireChurchPermission("members:manage", "church-B");
    } catch (e) {
      errorWrongChurch = e;
    }

    expect(errorNoRights).toBeInstanceOf(Error);
    expect(errorWrongChurch).toBeInstanceOf(Error);
    expect((errorNoRights as Error).message).toBe((errorWrongChurch as Error).message);
  });
});
