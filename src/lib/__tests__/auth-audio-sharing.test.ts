// Spec 036 — `requireAudioListenAccess` : élargit l'écoute aux bibliothèques partagées entre
// églises, sans jamais laisser un partage contaminer une autre permission de l'église
// propriétaire (planning, membres, événements…).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession, createSuperAdminSession } from "@/__mocks__/auth";

const mockAuth = vi.fn();
const mockListOutgoingShares = vi.fn();

vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});
vi.mock("@/modules/audio", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/audio")>();
  return { ...original, listOutgoingShares: (...args: unknown[]) => mockListOutgoingShares(...args) };
});

const { requireAudioListenAccess, requireChurchPermission } = await import("@/lib/auth");

const ownerChurchId = "church-owner";
const guestChurchId = "church-guest";

function sessionWithAudioListenRole(churchId: string) {
  return createSession({
    churchRoles: [
      {
        id: "role-1",
        churchId,
        role: "STAR",
        ministryId: null,
        church: { id: churchId, name: "Église", slug: "eglise" },
        departments: [],
      },
    ],
  });
}

describe("requireAudioListenAccess (spec 036)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passe pour un rôle direct portant audio:listen dans l'église visée", async () => {
    mockAuth.mockResolvedValue(sessionWithAudioListenRole(ownerChurchId));

    await expect(requireAudioListenAccess(ownerChurchId)).resolves.toBeDefined();
    expect(mockListOutgoingShares).not.toHaveBeenCalled();
  });

  it("passe pour un invité d'un partage ouvert par l'église visée", async () => {
    mockAuth.mockResolvedValue(sessionWithAudioListenRole(guestChurchId));
    mockListOutgoingShares.mockResolvedValue([
      { id: "share-1", churchId: guestChurchId, churchName: "Église invitée", churchSlug: "eglise-invitee", createdAt: new Date() },
    ]);

    await expect(requireAudioListenAccess(ownerChurchId)).resolves.toBeDefined();
    expect(mockListOutgoingShares).toHaveBeenCalledWith(ownerChurchId);
  });

  it("refuse un utilisateur sans rôle et sans partage reçu", async () => {
    mockAuth.mockResolvedValue(sessionWithAudioListenRole(guestChurchId));
    mockListOutgoingShares.mockResolvedValue([]);

    await expect(requireAudioListenAccess(ownerChurchId)).rejects.toThrow("FORBIDDEN");
  });

  it("refuse après révocation du partage", async () => {
    mockAuth.mockResolvedValue(sessionWithAudioListenRole(guestChurchId));
    mockListOutgoingShares.mockResolvedValue([]); // partage révoqué : plus dans la liste

    await expect(requireAudioListenAccess(ownerChurchId)).rejects.toThrow("FORBIDDEN");
  });

  it("un Super Admin passe toujours", async () => {
    mockAuth.mockResolvedValue(createSuperAdminSession());

    await expect(requireAudioListenAccess(ownerChurchId)).resolves.toBeDefined();
    expect(mockListOutgoingShares).not.toHaveBeenCalled();
  });

  it("non-contamination : le partage ne confère pas events:view dans l'église propriétaire", async () => {
    mockAuth.mockResolvedValue(sessionWithAudioListenRole(guestChurchId));
    mockListOutgoingShares.mockResolvedValue([
      { id: "share-1", churchId: guestChurchId, churchName: "Église invitée", churchSlug: "eglise-invitee", createdAt: new Date() },
    ]);

    // Le partage donne accès à l'écoute, jamais à requireChurchPermission — resté inchangé.
    await expect(requireChurchPermission("events:view", ownerChurchId)).rejects.toThrow("FORBIDDEN");
  });

  it("non-contamination : le partage ne confère pas members:view dans l'église propriétaire", async () => {
    mockAuth.mockResolvedValue(sessionWithAudioListenRole(guestChurchId));
    mockListOutgoingShares.mockResolvedValue([
      { id: "share-1", churchId: guestChurchId, churchName: "Église invitée", churchSlug: "eglise-invitee", createdAt: new Date() },
    ]);

    await expect(requireChurchPermission("members:view", ownerChurchId)).rejects.toThrow("FORBIDDEN");
  });
});
