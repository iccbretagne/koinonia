import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

// media-space.ts importe @/lib/auth (isProductionMediaMember/isCommunicationMember), qui
// initialise NextAuth et Prisma — non résolubles dans cet environnement de test sans ces
// mocks minimaux (voir auth-multitenant.test.ts pour le même pattern).
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const { buildMediaSpaceTabs } = await import("@/lib/media-space");
type MediaSpaceAccess = Parameters<typeof buildMediaSpaceTabs>[0];

function access(overrides: Partial<MediaSpaceAccess> = {}): MediaSpaceAccess {
  return { visuals: false, social: false, browse: false, collections: false, ...overrides };
}

describe("buildMediaSpaceTabs", () => {
  it("Production média seule : 4 onglets, sans Réseaux sociaux", () => {
    const tabs = buildMediaSpaceTabs(access({ visuals: true, browse: true, collections: true }));
    expect(tabs.map((t) => t.label)).toEqual([
      "Demandes visuels",
      "Projets",
      "Événements médias",
      "Collections",
    ]);
  });

  it("Communication seule : 4 onglets, sans Demandes visuels", () => {
    const tabs = buildMediaSpaceTabs(access({ social: true, browse: true, collections: true }));
    expect(tabs.map((t) => t.label)).toEqual([
      "Demandes réseaux sociaux",
      "Projets",
      "Événements médias",
      "Collections",
    ]);
  });

  it("les deux équipes : 5 onglets, sans doublon", () => {
    const tabs = buildMediaSpaceTabs({ visuals: true, social: true, browse: true, collections: true });
    expect(tabs.map((t) => t.label)).toEqual([
      "Demandes visuels",
      "Demandes réseaux sociaux",
      "Projets",
      "Événements médias",
      "Collections",
    ]);
  });

  it("Admin (tous les droits) : 5 onglets", () => {
    const tabs = buildMediaSpaceTabs({ visuals: true, social: true, browse: true, collections: true });
    expect(tabs).toHaveLength(5);
  });

  it("Secrétaire (browse seul, sans Collections) : Projets et Événements médias uniquement", () => {
    const tabs = buildMediaSpaceTabs(access({ browse: true }));
    expect(tabs.map((t) => t.label)).toEqual(["Projets", "Événements médias"]);
  });

  it("aucun droit : liste vide", () => {
    expect(buildMediaSpaceTabs(access())).toEqual([]);
  });

  it("ordre stable : toujours visuels · réseaux sociaux · projets · événements · collections", () => {
    const tabs = buildMediaSpaceTabs({ visuals: true, social: true, browse: true, collections: true });
    expect(tabs.map((t) => t.href)).toEqual([
      "/media/requests",
      "/communication/requests",
      "/media/projects",
      "/media/events",
      "/media/collections",
    ]);
  });
});
