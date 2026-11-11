/**
 * Spec 080 — accès à la galerie médias : `media:view`, équipes, Ministre des équipes média,
 * accès nominatif valide ; gestion des accès réservée à l'Admin, au Ministre média et au
 * Super Admin.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createSuperAdminSession,
  createMinisterSession,
  createDepartmentHeadSession,
  createSession,
} from "@/__mocks__/auth";

const mockAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});

const { requireMediaGalleryAccess, requireMediaGalleryGrantAccess, isMediaMinister } = await import("@/lib/auth");

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);

/** Compte STAR de l'église, sans département de service. */
const star = () =>
  createSession({
    churchRoles: [{ id: "r", churchId: "church-1", role: "STAR", ministryId: null, church: { id: "church-1", name: "C", slug: "c" }, departments: [] }],
  });

function noTeams() {
  prismaMock.department.findMany.mockResolvedValue([]);
  prismaMock.department.count.mockResolvedValue(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  noTeams();
  prismaMock.mediaGalleryGrant.findUnique.mockResolvedValue(null);
});

describe("requireMediaGalleryAccess", () => {
  it("Super Admin et Admin (media:view) : accès complet", async () => {
    mockAuth.mockResolvedValue(createSuperAdminSession());
    await expect(requireMediaGalleryAccess("church-1")).resolves.toMatchObject({ grantOnly: false });
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    await expect(requireMediaGalleryAccess("church-1")).resolves.toMatchObject({ grantOnly: false });
  });

  it("équipe Production Média : accès complet", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([{ id: "d-prod", name: "Prod" }], "church-1"));
    prismaMock.department.findMany.mockImplementation(({ where }: { where: { function: string } }) =>
      Promise.resolve(where.function === "PRODUCTION_MEDIA" ? [{ id: "d-prod" }] : [])
    );
    await expect(requireMediaGalleryAccess("church-1")).resolves.toMatchObject({ grantOnly: false });
  });

  it("équipe Communication : accès complet", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([{ id: "d-comm", name: "Comm" }], "church-1"));
    prismaMock.department.count.mockResolvedValueOnce(1); // isCommunicationMember
    await expect(requireMediaGalleryAccess("church-1")).resolves.toMatchObject({ grantOnly: false });
  });

  it("Ministre d'un ministère portant une équipe média : accès complet", async () => {
    mockAuth.mockResolvedValue(createMinisterSession("min-comm", "church-1"));
    prismaMock.department.count.mockImplementation(({ where }: { where: { ministryId?: unknown } }) =>
      Promise.resolve(where.ministryId ? 1 : 0)
    );
    await expect(requireMediaGalleryAccess("church-1")).resolves.toMatchObject({ grantOnly: false });
  });

  it("Ministre d'un autre ministère : refusé", async () => {
    mockAuth.mockResolvedValue(createMinisterSession("min-autre", "church-1"));
    await expect(requireMediaGalleryAccess("church-1")).rejects.toThrow("FORBIDDEN");
  });

  it("accès nominatif valide : lecture seule (grantOnly)", async () => {
    mockAuth.mockResolvedValue(star());
    prismaMock.mediaGalleryGrant.findUnique.mockResolvedValue({ expiresAt: future });
    await expect(requireMediaGalleryAccess("church-1")).resolves.toMatchObject({ grantOnly: true });
    prismaMock.mediaGalleryGrant.findUnique.mockResolvedValue({ expiresAt: null });
    await expect(requireMediaGalleryAccess("church-1")).resolves.toMatchObject({ grantOnly: true });
  });

  it("accès nominatif expiré, ou absent : refusé", async () => {
    mockAuth.mockResolvedValue(star());
    prismaMock.mediaGalleryGrant.findUnique.mockResolvedValue({ expiresAt: past });
    await expect(requireMediaGalleryAccess("church-1")).rejects.toThrow("FORBIDDEN");
    prismaMock.mediaGalleryGrant.findUnique.mockResolvedValue(null);
    await expect(requireMediaGalleryAccess("church-1")).rejects.toThrow("FORBIDDEN");
  });

  it("aucun rôle dans l'église (Admin d'une autre église, même avec un accès en base) : refusé", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-2"));
    prismaMock.mediaGalleryGrant.findUnique.mockResolvedValue({ expiresAt: null });
    await expect(requireMediaGalleryAccess("church-1")).rejects.toThrow("FORBIDDEN");
  });
});

describe("requireMediaGalleryGrantAccess", () => {
  it("Admin de l'église et Super Admin : autorisés", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    await expect(requireMediaGalleryGrantAccess("church-1")).resolves.toBeDefined();
    mockAuth.mockResolvedValue(createSuperAdminSession());
    await expect(requireMediaGalleryGrantAccess("church-1")).resolves.toBeDefined();
  });

  it("Ministre média : autorisé ; Ministre d'un autre ministère : refusé", async () => {
    mockAuth.mockResolvedValue(createMinisterSession("min-comm", "church-1"));
    prismaMock.department.count.mockResolvedValue(1);
    await expect(requireMediaGalleryGrantAccess("church-1")).resolves.toBeDefined();
    prismaMock.department.count.mockResolvedValue(0);
    await expect(requireMediaGalleryGrantAccess("church-1")).rejects.toThrow("FORBIDDEN");
  });

  it("membre d'une équipe média (sans être Admin ni Ministre) : refusé", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([{ id: "d-comm", name: "Comm" }], "church-1"));
    await expect(requireMediaGalleryGrantAccess("church-1")).rejects.toThrow("FORBIDDEN");
  });

  it("Admin d'une autre église : refusé", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-2"));
    await expect(requireMediaGalleryGrantAccess("church-1")).rejects.toThrow("FORBIDDEN");
  });
});

describe("isMediaMinister", () => {
  it("cherche un département média dans les ministères du Ministre, dans l'église", async () => {
    prismaMock.department.count.mockResolvedValue(1);
    await expect(isMediaMinister(createMinisterSession("min-comm", "church-1"), "church-1")).resolves.toBe(true);
    expect(prismaMock.department.count).toHaveBeenCalledWith({
      where: {
        function: { in: ["PHOTOS", "PRODUCTION_MEDIA", "COMMUNICATION"] },
        ministryId: { in: ["min-comm"] },
        ministry: { churchId: "church-1" },
      },
    });
  });

  it("pas Ministre dans cette église : faux sans requête", async () => {
    await expect(isMediaMinister(createAdminSession("church-1"), "church-1")).resolves.toBe(false);
    expect(prismaMock.department.count).not.toHaveBeenCalled();
  });
});
