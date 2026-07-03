import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

const { normalizeName, normalizeEmail, findDuplicateCandidates } = await import("../onboarding");

describe("normalizeName", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeName("Jérémie Dupont")).toBe("jeremie dupont");
  });

  it("collapses extra whitespace", () => {
    expect(normalizeName("  Jean   Dupont  ")).toBe("jean dupont");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jean.Dupont@Example.com ")).toBe("jean.dupont@example.com");
  });
});

describe("findDuplicateCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches on exact normalized email", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      { id: "m1", firstName: "Alice", lastName: "Martin", email: "Alice.Martin@Example.com" },
      { id: "m2", firstName: "Bob", lastName: "Smith", email: "bob@example.com" },
    ]);

    const result = await findDuplicateCandidates("church-1", {
      email: "alice.martin@example.com",
      firstName: "Alicia",
      lastName: "Martine",
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m1");
  });

  it("matches on accent-insensitive normalized name", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      { id: "m1", firstName: "Jérémie", lastName: "Dupont", email: null },
    ]);

    const result = await findDuplicateCandidates("church-1", {
      email: undefined,
      firstName: "Jeremie",
      lastName: "dupont",
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m1");
  });

  it("scopes the search to the given church", async () => {
    prismaMock.member.findMany.mockResolvedValue([]);

    await findDuplicateCandidates("church-1", {
      email: "test@example.com",
      firstName: "Jean",
      lastName: "Dupont",
    });

    expect(prismaMock.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { departments: { some: { department: { ministry: { churchId: "church-1" } } } } },
      })
    );
  });

  it("returns no false positive when neither email nor name matches", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      { id: "m1", firstName: "Alice", lastName: "Martin", email: "alice@example.com" },
    ]);

    const result = await findDuplicateCandidates("church-1", {
      email: "someone.else@example.com",
      firstName: "Someone",
      lastName: "Else",
    });

    expect(result).toHaveLength(0);
  });
});
