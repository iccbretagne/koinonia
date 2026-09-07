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

  it("ne fait pas de recherche floue par email (évite l'énumération par nom)", async () => {
    prismaMock.user.findMany.mockResolvedValue([] as never);

    const request = new Request("http://localhost/api/users/search?q=jean&churchId=church-1");
    await GET(request);

    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    // La recherche floue (contains) ne doit pas porter sur l'email
    expect(JSON.stringify(findManyCall.where)).not.toContain('"email"');
  });

  it("retrouve par email exact un compte sans rôle ni demande dans cette église (STAR d'une autre église)", async () => {
    prismaMock.user.findMany.mockResolvedValue([] as never);
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-other-church",
      name: "Emmanuella Sohou",
      displayName: null,
      image: null,
      memberLinks: [], // aucun lien dans church-1, seulement dans une autre église
    } as never);

    const request = new Request(
      "http://localhost/api/users/search?q=sohouemmanuella%40gmail.com&churchId=church-1"
    );
    const res = await GET(request);
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("user-other-church");
    // La correspondance email est exacte, jamais floue
    const findFirstCall = prismaMock.user.findFirst.mock.calls[0][0];
    expect(findFirstCall.where).toEqual({ email: "sohouemmanuella@gmail.com" });
  });

  it("un fragment d'email (même avec '@') ne renvoie rien — correspondance exacte uniquement", async () => {
    prismaMock.user.findMany.mockResolvedValue([] as never);
    // La requête n'est qu'un fragment de l'adresse réelle : une égalité Prisma ne matche pas,
    // contrairement à un `contains`. Le mock reflète ce que ferait la vraie base.
    prismaMock.user.findFirst.mockResolvedValue(null);

    const request = new Request("http://localhost/api/users/search?q=sohouemmanuella%40gmail&churchId=church-1");
    const res = await GET(request);
    const body = await res.json();

    expect(body).toEqual([]);
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "sohouemmanuella@gmail" } })
    );
  });

  it("ne cherche pas par email si la requête ne contient pas '@'", async () => {
    prismaMock.user.findMany.mockResolvedValue([] as never);

    const request = new Request("http://localhost/api/users/search?q=jean&churchId=church-1");
    await GET(request);

    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("exclut le résultat email si déjà lié dans cette église", async () => {
    prismaMock.user.findMany.mockResolvedValue([] as never);
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-already-linked",
      name: "Jean Déjà Lié",
      displayName: null,
      image: null,
      memberLinks: [{ id: "link-1" }],
    } as never);

    const request = new Request("http://localhost/api/users/search?q=jean%40example.com&churchId=church-1");
    const res = await GET(request);
    const body = await res.json();

    expect(body).toHaveLength(0);
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
