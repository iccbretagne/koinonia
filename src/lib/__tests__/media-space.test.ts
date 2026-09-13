import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

// media-space.ts importe @/lib/auth (isMediaTeamMember/isCommunicationMember), qui initialise
// NextAuth et Prisma — non résolubles dans cet environnement de test sans ces mocks minimaux
// (voir auth-multitenant.test.ts pour le même pattern).
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const { buildMediaSpaceCards, buildVisualsTabs } = await import("@/lib/media-space");
type MediaSpaceAccess = Parameters<typeof buildMediaSpaceCards>[0];

function access(overrides: Partial<MediaSpaceAccess> = {}): MediaSpaceAccess {
  return { photos: false, visuals: false, visualRequests: false, social: false, share: false, ...overrides };
}

describe("buildMediaSpaceCards", () => {
  it("équipe Photos seule : une carte Photos", () => {
    const cards = buildMediaSpaceCards(access({ photos: true }));
    expect(cards.map((c) => c.title)).toEqual(["Photos"]);
  });

  it("équipe Production Média seule : une carte Visuels (bibliothèque)", () => {
    const cards = buildMediaSpaceCards(access({ visuals: true, visualRequests: true }));
    expect(cards.map((c) => c.title)).toEqual(["Visuels"]);
    expect(cards[0].href).toBe("/media/projects");
  });

  it("carte Visuels visible via les demandes seules (sans accès à la bibliothèque)", () => {
    const cards = buildMediaSpaceCards(access({ visualRequests: true }));
    expect(cards.map((c) => c.title)).toEqual(["Visuels"]);
    expect(cards[0].href).toBe("/media/requests");
  });

  it("équipe Communication seule : une carte Réseaux sociaux", () => {
    const cards = buildMediaSpaceCards(access({ social: true }));
    expect(cards.map((c) => c.title)).toEqual(["Réseaux sociaux"]);
  });

  it("Admin (tous les droits) : 3 cartes, ordre fixe Photos · Visuels · Réseaux sociaux", () => {
    const cards = buildMediaSpaceCards(
      access({ photos: true, visuals: true, visualRequests: true, social: true, share: true })
    );
    expect(cards.map((c) => c.title)).toEqual(["Photos", "Visuels", "Réseaux sociaux"]);
  });

  it("aucun droit : liste vide", () => {
    expect(buildMediaSpaceCards(access())).toEqual([]);
  });
});

describe("buildVisualsTabs", () => {
  it("les deux onglets internes si bibliothèque et demandes accessibles", () => {
    const tabs = buildVisualsTabs(access({ visuals: true, visualRequests: true }));
    expect(tabs.map((t) => t.label)).toEqual(["Projets", "Demandes"]);
  });

  it("un seul onglet si un seul droit", () => {
    expect(buildVisualsTabs(access({ visuals: true })).map((t) => t.label)).toEqual(["Projets"]);
    expect(buildVisualsTabs(access({ visualRequests: true })).map((t) => t.label)).toEqual(["Demandes"]);
  });

  it("aucun droit : liste vide", () => {
    expect(buildVisualsTabs(access())).toEqual([]);
  });
});
