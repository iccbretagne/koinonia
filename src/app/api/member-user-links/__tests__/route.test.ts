/**
 * Tests — POST /api/member-user-links (spec 037 : rattachement à une nouvelle église)
 *
 * L'ancienne exigence « l'utilisateur doit déjà avoir un lien avec cette église » est
 * volontairement supprimée : c'était le verrou circulaire que la spec 037 lève. Le rattachement
 * doit désormais réussir pour un compte sans aucun rattachement préalable, ET lui donner un
 * accès effectif (rôle STAR par défaut) — c'est le défaut qu'avait la PR #524 (fermée) : elle
 * levait la recherche sans lever ce verrou d'écriture.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockRequireRateLimit = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: (...args: unknown[]) => mockRequireRateLimit(...args),
  RATE_LIMIT_SENSITIVE: { windowMs: 60000, max: 10 },
}));

const { POST } = await import("../route");

const baseMember = {
  id: "member-1",
  firstName: "Jean",
  lastName: "Dupont",
};

function setupTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
  );
}

describe("POST /api/member-user-links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
    mockRequireRateLimit.mockReturnValue(undefined);
    prismaMock.member.findFirst.mockResolvedValue(baseMember as never);
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null); // pas de doublon côté membre
  });

  it("admet un compte sans aucun rattachement préalable à cette église, et lui donne un rôle", async () => {
    // Compte réel : lié à un STAR d'une AUTRE église, aucun rôle ni demande dans church-1.
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-other-church", email: "e@x.com" } as never);
    prismaMock.memberUserLink.findFirst.mockResolvedValue(null); // pas déjà lié dans cette église
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null); // aucun rôle dans church-1
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);
    prismaMock.memberUserLink.create.mockResolvedValue({} as never);
    prismaMock.memberUserLink.findUniqueOrThrow.mockResolvedValue({ id: "link-1" } as never);
    setupTransaction();

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({ memberId: "member-1", userId: "user-other-church", churchId: "church-1" }),
    });
    const res = await POST(request);

    expect(res.status).toBe(201);
    expect(prismaMock.userChurchRole.create).toHaveBeenCalledWith({
      data: { userId: "user-other-church", churchId: "church-1", role: "STAR" },
    });
  });

  it("retrouve et rattache un compte par email exact", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-by-email", email: "e@x.com" } as never);
    prismaMock.memberUserLink.findFirst.mockResolvedValue(null);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);
    prismaMock.memberUserLink.create.mockResolvedValue({} as never);
    prismaMock.memberUserLink.findUniqueOrThrow.mockResolvedValue({ id: "link-1" } as never);
    setupTransaction();

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({ memberId: "member-1", email: "e@x.com", churchId: "church-1" }),
    });
    const res = await POST(request);

    expect(res.status).toBe(201);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { email: "e@x.com" } });
  });

  it("répond 409 avec un marqueur si l'email ne correspond à aucun compte, sans confirmCreate", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({ memberId: "member-1", email: "inconnu@x.com", churchId: "church-1" }),
    });
    const res = await POST(request);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({ accountNotFound: true });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("crée le compte et l'admet si l'email est inconnu et confirmCreate est vrai", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "user-new", email: "inconnu@x.com" } as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);
    prismaMock.memberUserLink.create.mockResolvedValue({} as never);
    prismaMock.memberUserLink.findUniqueOrThrow.mockResolvedValue({ id: "link-1" } as never);
    setupTransaction();

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({
        memberId: "member-1",
        email: "inconnu@x.com",
        churchId: "church-1",
        confirmCreate: true,
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith({ data: { email: "inconnu@x.com" } });
  });

  it("retourne 404 si le STAR n'appartient pas à l'église", async () => {
    prismaMock.member.findFirst.mockResolvedValue(null);

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({ memberId: "member-other-church", userId: "user-1", churchId: "church-1" }),
    });

    const res = await POST(request);
    expect(res.status).toBe(404);
  });

  it("retourne 404 si l'userId fourni ne correspond à aucun compte", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({ memberId: "member-1", userId: "user-inconnu", churchId: "church-1" }),
    });

    const res = await POST(request);
    expect(res.status).toBe(404);
  });

  it("refuse si le STAR est déjà lié à un compte dans cette église", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1", email: "e@x.com" } as never);
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ id: "existing-link" } as never);

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({ memberId: "member-1", userId: "user-1", churchId: "church-1" }),
    });

    const res = await POST(request);
    expect(res.status).toBe(409);
  });

  it("refuse si le compte est déjà lié à un STAR dans cette église", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1", email: "e@x.com" } as never);
    prismaMock.memberUserLink.findFirst.mockResolvedValue({ id: "existing-link" } as never);

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({ memberId: "member-1", userId: "user-1", churchId: "church-1" }),
    });

    const res = await POST(request);
    expect(res.status).toBe(409);
  });

  it("refuse si ni userId ni email ne sont fournis", async () => {
    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({ memberId: "member-1", churchId: "church-1" }),
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
  });
});
