/**
 * Tests de sécurité — P0-1 : RBAC tokens média
 *
 * - Un utilisateur avec media:view uniquement ne doit pas voir le token VALIDATOR/PREVALIDATOR
 * - Un utilisateur avec media:manage peut voir le token VALIDATOR/PREVALIDATOR
 * - Un utilisateur avec media:upload mais sans media:manage ne peut pas créer un token VALIDATOR
 * - Un utilisateur avec media:manage peut créer un token VALIDATOR
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockRequireMediaAccess = vi.fn();
const mockRequireMediaUploadAccess = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  requireMediaAccess: (...args: unknown[]) => mockRequireMediaAccess(...args),
  requireMediaUploadAccess: (...args: unknown[]) => mockRequireMediaUploadAccess(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/modules/media", () => ({
  createMediaShareToken: vi.fn().mockResolvedValue({ id: "tok-1", token: "abc123", type: "VALIDATOR" }),
  getTokenUrlPath: vi.fn((type: string) => type.toLowerCase()),
}));

vi.mock("@/lib/registry", () => ({
  rolePermissions: {
    ADMIN: ["media:view", "media:upload", "media:manage", "media:review"],
    DEPARTMENT_HEAD: ["media:view", "media:upload"],
  },
}));

const { GET, POST, DELETE } = await import("../route");

const makeParams = (id: string) => Promise.resolve({ id });

describe("GET /api/media-events/[id]/share — P0-1 token visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.mediaShareToken.findMany.mockResolvedValue([
      {
        id: "tok-1",
        token: "secret-validator-token",
        type: "VALIDATOR",
        mediaEventId: "ev-1",
        label: null,
        expiresAt: null,
        onlyApproved: false,
        usageCount: 0,
        lastUsedAt: null,
        createdAt: new Date(),
      },
      {
        id: "tok-2",
        token: "public-media-token",
        type: "MEDIA",
        mediaEventId: "ev-1",
        label: null,
        expiresAt: null,
        onlyApproved: false,
        usageCount: 0,
        lastUsedAt: null,
        createdAt: new Date(),
      },
    ] as never);
  });

  it("masque le token VALIDATOR pour un utilisateur avec media:view uniquement (DEPARTMENT_HEAD)", async () => {
    // DEPARTMENT_HEAD a media:view et media:upload mais pas media:manage
    mockRequireMediaAccess.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-1", name: "Son" }])
    );

    const res = await GET(new Request("http://localhost/api/media-events/ev-1/share"), {
      params: makeParams("ev-1"),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const validatorToken = body.find((t: { type: string }) => t.type === "VALIDATOR");
    expect(validatorToken.token).toBeUndefined();
    expect(validatorToken.url).toBeUndefined();

    // Le token MEDIA reste visible
    const mediaToken = body.find((t: { type: string }) => t.type === "MEDIA");
    expect(mediaToken.token).toBe("public-media-token");
  });

  it("retourne le token VALIDATOR complet pour un ADMIN (media:manage)", async () => {
    mockRequireMediaAccess.mockResolvedValue(createAdminSession());

    const res = await GET(new Request("http://localhost/api/media-events/ev-1/share"), {
      params: makeParams("ev-1"),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const validatorToken = body.find((t: { type: string }) => t.type === "VALIDATOR");
    expect(validatorToken.token).toBe("secret-validator-token");
    expect(validatorToken.url).toContain("secret-validator-token");
  });
});

describe("POST /api/media-events/[id]/share — P0-1 token creation RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse la création d'un token VALIDATOR sans media:manage", async () => {
    // Premier appel (media:upload) passe, mais le second (media:manage) pour VALIDATOR doit rejeter
    mockRequireMediaUploadAccess.mockResolvedValueOnce(createDepartmentHeadSession([{ id: "dept-1", name: "Son" }])); // upload ok
    mockRequireChurchPermission.mockRejectedValueOnce(Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN", status: 403 })); // media:manage rejeté

    const request = new Request("http://localhost/api/media-events/ev-1/share", {
      method: "POST",
      body: JSON.stringify({ type: "VALIDATOR" }),
    });

    const res = await POST(request, { params: makeParams("ev-1") });
    expect(res.status).toBe(403);
  });

  it("autorise la création d'un token VALIDATOR avec media:manage", async () => {
    prismaMock.mediaShareToken.count.mockResolvedValue(0);
    mockRequireMediaUploadAccess.mockResolvedValue(createAdminSession());
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());

    const request = new Request("http://localhost/api/media-events/ev-1/share", {
      method: "POST",
      body: JSON.stringify({ type: "VALIDATOR" }),
    });

    const res = await POST(request, { params: makeParams("ev-1") });
    expect(res.status).toBe(201);
  });

  it("autorise la création d'un token MEDIA sans media:manage", async () => {
    mockRequireMediaUploadAccess.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-1", name: "Son" }])
    );

    const request = new Request("http://localhost/api/media-events/ev-1/share", {
      method: "POST",
      body: JSON.stringify({ type: "MEDIA" }),
    });

    const res = await POST(request, { params: makeParams("ev-1") });
    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/media-events/[id]/share — P0-1 token deletion RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse la suppression d'un token VALIDATOR sans media:manage", async () => {
    prismaMock.mediaShareToken.findUnique.mockResolvedValue({
      id: "tok-1",
      type: "VALIDATOR",
    } as never);
    mockRequireMediaUploadAccess.mockResolvedValueOnce(createDepartmentHeadSession([{ id: "dept-1", name: "Son" }])); // upload ok
    mockRequireChurchPermission.mockRejectedValueOnce(Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN", status: 403 })); // media:manage rejeté

    const url = "http://localhost/api/media-events/ev-1/share?tokenId=tok-1";
    const res = await DELETE(new Request(url, { method: "DELETE" }), {
      params: makeParams("ev-1"),
    });

    expect(res.status).toBe(403);
  });

  it("autorise la suppression d'un token MEDIA sans media:manage", async () => {
    prismaMock.mediaShareToken.findUnique.mockResolvedValue({
      id: "tok-2",
      type: "MEDIA",
    } as never);
    prismaMock.mediaShareToken.delete.mockResolvedValue({ id: "tok-2" } as never);
    mockRequireMediaUploadAccess.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-1", name: "Son" }])
    );

    const url = "http://localhost/api/media-events/ev-1/share?tokenId=tok-2";
    const res = await DELETE(new Request(url, { method: "DELETE" }), {
      params: makeParams("ev-1"),
    });

    expect(res.status).toBe(200);
  });
});
