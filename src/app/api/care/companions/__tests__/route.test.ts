import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createSecretarySession } from "@/__mocks__/auth";

const mockAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});

const { GET } = await import("../route");

const churchId = "church-1";

describe("GET /api/care/companions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(createAdminSession(churchId));
  });

  it("réunit les membres de plusieurs départements MSDP sans doublon (spec 046)", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      { userLinks: [{ user: { id: "u1", name: "Jean Dupont", email: "jean@example.com", image: null } }] },
      {
        userLinks: [
          { user: { id: "u1", name: "Jean Dupont", email: "jean@example.com", image: null } },
          { user: { id: "u2", name: "Alice Martin", email: "alice@example.com", image: null } },
        ],
      },
    ] as never);

    const res = await GET(new Request(`https://koinonia.test/api/care/companions?churchId=${churchId}`));
    const body = await res.json();

    expect(prismaMock.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { departments: { some: { department: { function: "MSDP", ministry: { churchId } } } } },
      })
    );
    expect(body.msdpMembers).toHaveLength(2);
    expect(body.msdpMembers.map((c: { id: string }) => c.id).sort()).toEqual(["u1", "u2"]);
  });

  it("refuse un lecteur sans care:qualify (Secrétaire, care:view seul)", async () => {
    mockAuth.mockResolvedValue(createSecretarySession(churchId));

    const res = await GET(new Request(`https://koinonia.test/api/care/companions?churchId=${churchId}`));

    expect(res.status).toBe(403);
  });

  it("400 quand churchId est manquant", async () => {
    const res = await GET(new Request("https://koinonia.test/api/care/companions"));
    expect(res.status).toBe(400);
  });
});
