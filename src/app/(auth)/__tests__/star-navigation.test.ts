// Spec 031/#462, T29 — le STAR perd l'entrée de sidebar "Planning" (grille par
// département, /dashboard) mais conserve "Mon planning", les événements STAR et
// l'auto-déclaration d'absence, tous dérivés de planning:view (jamais retiré au STAR).
// Sans ce test, une régression future sur la dissociation faite en T17 (hasPlanningAccess
// vs. hasMyPlanning/showStarEvents) ne serait détectée par aucun autre test.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStarSession, createAdminSession } from "@/__mocks__/auth";
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
    prismaMock.church.findUnique.mockResolvedValue({ name: "Test Church", primaryColor: "#5E17EB" } as never);
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

  it("un STAR lié à un membre conserve hasAbsences (auto-déclaration)", async () => {
    mockAuth.mockResolvedValue(createStarSession("church-1"));
    const element = await AuthLayout({ children: null as never });
    expect(shellProps(element).hasAbsences).toBe(true);
  });

  it("un Admin conserve hasPlanningAccess (planning:department accordé)", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    const element = await AuthLayout({ children: null as never });
    expect(shellProps(element).hasPlanningAccess).toBe(true);
  });
});
