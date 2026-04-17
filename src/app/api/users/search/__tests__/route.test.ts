/**
 * Tests — HIGH-1 : Recherche utilisateurs limitée à l'église (isolation inter-tenant)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { GET } = await import("../route");

describe("GET /api/users/search — isolation inter-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
  });

  it("retourne 400 si churchId manquant", async () => {
    const request = new Request("http://localhost/api/users/search?q=jean");
    const res = await GET(request);
    expect(res.status).toBe(400);
  });

  it("retourne [] si q < 2 caractères", async () => {
    const request = new Request("http://localhost/api/users/search?q=j&churchId=church-1");
    const res = await GET(request);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("filtre par churchId dans la requête Prisma (isolation inter-tenant)", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        name: "Jean Dupont",
        displayName: "Jean",
        image: null,
        memberLinks: [],
      },
    ] as never);

    const request = new Request("http://localhost/api/users/search?q=jean&churchId=church-1");
    const res = await GET(request);
    expect(res.status).toBe(200);

    // Vérifier que la requête Prisma inclut le filtre churchId
    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    expect(JSON.stringify(findManyCall.where)).toContain("church-1");
    expect(JSON.stringify(findManyCall.where)).toContain("churchRoles");
  });

  it("ne filtre pas par email (évite les fuites d'email)", async () => {
    prismaMock.user.findMany.mockResolvedValue([] as never);

    const request = new Request("http://localhost/api/users/search?q=jean&churchId=church-1");
    await GET(request);

    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    // La requête ne doit pas chercher par email
    expect(JSON.stringify(findManyCall.where)).not.toContain('"email"');
  });

  it("exclut les utilisateurs déjà liés à un STAR dans cette église", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "user-linked",
        name: "Jean Lié",
        displayName: null,
        image: null,
        memberLinks: [{ id: "link-1" }], // déjà lié
      },
      {
        id: "user-free",
        name: "Jean Libre",
        displayName: null,
        image: null,
        memberLinks: [], // pas encore lié
      },
    ] as never);

    const request = new Request("http://localhost/api/users/search?q=jean&churchId=church-1");
    const res = await GET(request);
    const body = await res.json();

    // Seul l'utilisateur non lié doit être retourné
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("user-free");
  });
});
