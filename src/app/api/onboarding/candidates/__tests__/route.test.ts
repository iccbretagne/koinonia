/**
 * Tests — P2 : réconciliation par email (GET /api/onboarding/candidates)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockRequireAuth = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { GET } = await import("../route");

function memberRow(id: string, email: string | null) {
  return {
    id,
    firstName: "Alice",
    lastName: "Martin",
    email,
    departments: [
      {
        department: {
          name: "Son",
          ministry: { church: { id: "c1", name: "ICC Rennes" } },
        },
      },
    ],
  };
}

describe("GET /api/onboarding/candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ user: { id: "user-1", email: "alice@example.com" } });
  });

  it("retourne les fiches non liées correspondant à l'email de session", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      memberRow("m1", "Alice@Example.com"),
      memberRow("m2", "other@example.com"),
    ] as never);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({ memberId: "m1", churchId: "c1", churchName: "ICC Rennes" });
  });

  it("ne recherche que les fiches sans lien utilisateur", async () => {
    prismaMock.member.findMany.mockResolvedValue([] as never);

    await GET();

    expect(prismaMock.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { not: null }, userLinks: { none: {} } },
      })
    );
  });

  it("retourne une liste vide quand le compte n'a pas d'email", async () => {
    mockRequireAuth.mockResolvedValue({ user: { id: "user-1", email: null } });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toEqual([]);
    expect(prismaMock.member.findMany).not.toHaveBeenCalled();
  });
});
