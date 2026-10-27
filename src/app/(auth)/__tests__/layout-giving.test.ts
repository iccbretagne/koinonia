/**
 * Lien « Page de dons » (spec 065) : absent quand le module `giving` n'est pas actif, même pour
 * un Super Admin (qui reçoit sinon toutes les permissions des liens de configuration). La
 * présence pour Admin, Secrétaire et Comptable est couverte par `layout-props.test.ts`.
 */
import { describe, it, expect, vi } from "vitest";
import { createAuthScopeMocks, createSuperAdminSession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/auth", () => ({
  auth: async () => createSuperAdminSession(),
  signOut: vi.fn(),
  getCurrentChurchId: async () => "church-1",
  ...createAuthScopeMocks(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/registry")>();
  const registry = Object.create(actual.registry);
  registry.has = (name: string) => name !== "giving" && actual.registry.has(name);
  return { ...actual, registry };
});
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/modules/care", () => ({ getCareAccess: async () => ({ ownProfileIds: [] }) }));

const AuthLayout = (await import("../layout")).default;

describe("AuthLayout — module dons désactivé", () => {
  it("n'affiche pas « Page de dons », même à un Super Admin", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ name: "Rennes", primaryColor: null , logos: [] } as never);
    prismaMock.church.findMany.mockResolvedValue([] as never);
    prismaMock.department.findMany.mockResolvedValue([] as never);
    prismaMock.department.count.mockResolvedValue(0);
    prismaMock.familyLeaderAssignment.count.mockResolvedValue(0);
    prismaMock.pastoralProfile.findFirst.mockResolvedValue(null);
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);

    const element = await AuthLayout({ children: null as never });
    const { configLinks } = (element as unknown as { props: { configLinks: { href: string }[] } }).props;
    expect(configLinks.length).toBeGreaterThan(0);
    expect(configLinks.map((l) => l.href)).not.toContain("/dons");
  });
});
