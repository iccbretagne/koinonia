/**
 * Spec 092, lot 3 (T3.1) — la lecture pastorale étendue n'est pas une permission : un helper
 * nommé, borné à l'église du profil, et une liste de permissions pastorales figée.
 */
import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession, createStarSession } from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const { hasPastoralRead, PASTORAL_READ_PERMISSION_LIST } = await import("@/lib/auth");

describe("PASTORAL_READ_PERMISSIONS — liste figée", () => {
  it("n'accorde que ces cinq permissions de lecture (aucune écriture, aucun export, ni reports ni accounting:view)", () => {
    expect([...PASTORAL_READ_PERMISSION_LIST].sort()).toEqual(
      ["accounting:stats", "discipleship:view", "events:view", "members:view", "planning:view"].sort()
    );
  });
});

describe("hasPastoralRead", () => {
  it("vrai seulement dans une église du profil pastoral", () => {
    const session = createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] } as never);
    expect(hasPastoralRead(session, "church-1")).toBe(true);
    expect(hasPastoralRead(session, "church-2")).toBe(false);
  });

  it("faux sans profil pastoral, quel que soit le rôle", () => {
    expect(hasPastoralRead(createStarSession("church-1"), "church-1")).toBe(false);
    expect(hasPastoralRead(createSession({ churchRoles: [] } as never), "church-1")).toBe(false);
  });
});
