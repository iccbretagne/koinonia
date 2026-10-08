import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockAuth = vi.fn();
const mockGetCurrentChurchId = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  getCurrentChurchId: (...args: unknown[]) => mockGetCurrentChurchId(...args),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const { requirePastoralActiveChurch } = await import("../active-church");

const pastoralSession = { user: { id: "u1", pastoralChurchIds: ["c1"] } };

describe("requirePastoralActiveChurch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(pastoralSession);
    mockGetCurrentChurchId.mockResolvedValue("c1");
  });

  it("redirige sans session, ou sans église pastorale", async () => {
    mockAuth.mockResolvedValueOnce(null);
    await expect(requirePastoralActiveChurch()).rejects.toThrow("REDIRECT:/");
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", pastoralChurchIds: [] } });
    await expect(requirePastoralActiveChurch()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("profil direct : église courante active", async () => {
    prismaMock.pastoralProfile.findFirst.mockResolvedValueOnce({ id: "p1", churchId: "c1", responsibleForChurch: null } as never);
    await expect(requirePastoralActiveChurch()).resolves.toEqual({ session: pastoralSession, activeChurchId: "c1" });
    expect(prismaMock.pastoralProfile.findFirst).toHaveBeenCalledTimes(1);
  });

  it("église supervisée : repli sur le profil superviseur", async () => {
    prismaMock.pastoralProfile.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "p2", churchId: "c9", responsibleForChurch: null } as never);
    await expect(requirePastoralActiveChurch()).resolves.toMatchObject({ activeChurchId: "c1" });
    expect(prismaMock.pastoralProfile.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { userId: "u1", supervisorForChurches: { some: { id: "c1" } } } })
    );
  });

  it("aucun profil : redirige vers l'espace pastoral", async () => {
    prismaMock.pastoralProfile.findFirst.mockResolvedValue(null);
    await expect(requirePastoralActiveChurch()).rejects.toThrow("REDIRECT:/pastoral");
  });

  it("sans église courante : église dont le profil est responsable, puis la sienne", async () => {
    mockGetCurrentChurchId.mockResolvedValue(null);
    prismaMock.pastoralProfile.findFirst.mockResolvedValueOnce({ id: "p1", churchId: "c1", responsibleForChurch: { id: "c5" } } as never);
    await expect(requirePastoralActiveChurch()).resolves.toMatchObject({ activeChurchId: "c5" });
    prismaMock.pastoralProfile.findFirst.mockResolvedValueOnce({ id: "p1", churchId: "c1", responsibleForChurch: null } as never);
    await expect(requirePastoralActiveChurch()).resolves.toMatchObject({ activeChurchId: "c1" });
  });
});
