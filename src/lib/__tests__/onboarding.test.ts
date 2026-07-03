import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

const {
  normalizeName,
  normalizeEmail,
  findDuplicateCandidates,
  findUnlinkedMembersByEmail,
  assertSelfLinkAllowed,
} = await import("../onboarding");

// Fabrique une fiche telle que renvoyée par findMany (avec département principal)
function memberRow(over: {
  id: string;
  email: string | null;
  churchId?: string;
  churchName?: string;
  department?: string;
  noPrimary?: boolean;
}) {
  return {
    id: over.id,
    firstName: "Jean",
    lastName: "Dupont",
    email: over.email,
    departments: over.noPrimary
      ? []
      : [
          {
            department: {
              name: over.department ?? "Choristes",
              ministry: {
                church: { id: over.churchId ?? "church-1", name: over.churchName ?? "ICC Rennes" },
              },
            },
          },
        ],
  };
}

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

describe("findUnlinkedMembersByEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches on normalized email and returns church + primary department", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      memberRow({ id: "m1", email: "Alice@Example.com", churchId: "c1", churchName: "ICC Rennes", department: "Son" }),
      memberRow({ id: "m2", email: "bob@example.com", churchId: "c1" }),
    ] as never);

    const result = await findUnlinkedMembersByEmail("  alice@example.com ");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      memberId: "m1",
      churchId: "c1",
      churchName: "ICC Rennes",
      department: "Son",
    });
  });

  it("only queries members without any user link", async () => {
    prismaMock.member.findMany.mockResolvedValue([] as never);

    await findUnlinkedMembersByEmail("alice@example.com");

    expect(prismaMock.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { not: null }, userLinks: { none: {} } },
      })
    );
  });

  it("returns candidates across multiple churches", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      memberRow({ id: "m1", email: "alice@example.com", churchId: "c1", churchName: "Rennes" }),
      memberRow({ id: "m2", email: "alice@example.com", churchId: "c2", churchName: "Brest" }),
    ] as never);

    const result = await findUnlinkedMembersByEmail("alice@example.com");

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.churchId).sort()).toEqual(["c1", "c2"]);
  });

  it("skips members without a primary department", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      memberRow({ id: "m1", email: "alice@example.com", noPrimary: true }),
    ] as never);

    const result = await findUnlinkedMembersByEmail("alice@example.com");

    expect(result).toHaveLength(0);
  });
});

describe("assertSelfLinkAllowed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.memberDepartment.findFirst.mockResolvedValue({ id: "md1" } as never);
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
  });

  it("resolves when email matches, church is correct and no existing link", async () => {
    await expect(
      assertSelfLinkAllowed("Alice@Example.com", { id: "m1", email: "alice@example.com" }, "c1")
    ).resolves.toBeUndefined();
  });

  it("rejects when session email is absent", async () => {
    await expect(
      assertSelfLinkAllowed(null, { id: "m1", email: "alice@example.com" }, "c1")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects when emails differ", async () => {
    await expect(
      assertSelfLinkAllowed("other@example.com", { id: "m1", email: "alice@example.com" }, "c1")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects when the member is not in the target church", async () => {
    prismaMock.memberDepartment.findFirst.mockResolvedValue(null);
    await expect(
      assertSelfLinkAllowed("alice@example.com", { id: "m1", email: "alice@example.com" }, "c1")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects when the member is already linked", async () => {
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ id: "link-1" } as never);
    await expect(
      assertSelfLinkAllowed("alice@example.com", { id: "m1", email: "alice@example.com" }, "c1")
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
