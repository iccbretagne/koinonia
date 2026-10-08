import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession } from "@/__mocks__/auth";

const mockRequireMediaAccess = vi.fn();
const mockRequireMediaUploadAccess = vi.fn();
const mockRequireMediaManageAccess = vi.fn();
const mockIsMediaTeamMember = vi.fn().mockResolvedValue(true);
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
const mockCreateToken = vi.fn().mockResolvedValue({ id: "tok-1" });

vi.mock("@/lib/auth", () => ({
  requireMediaAccess: (...args: unknown[]) => mockRequireMediaAccess(...args),
  requireMediaUploadAccess: (...args: unknown[]) => mockRequireMediaUploadAccess(...args),
  requireMediaManageAccess: (...args: unknown[]) => mockRequireMediaManageAccess(...args),
  isMediaTeamMember: (...args: unknown[]) => mockIsMediaTeamMember(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/media", () => ({
  createMediaShareToken: (...args: unknown[]) => mockCreateToken(...args),
  getTokenUrlPath: vi.fn((type: string) => type.toLowerCase()),
}));
vi.mock("@/lib/registry", () => ({
  rolePermissions: {
    ADMIN: ["media:view", "media:upload", "media:manage"],
    DEPARTMENT_HEAD: ["media:view", "media:upload"],
  },
}));

const { GET, POST, DELETE } = await import("../route");
const ctx = { params: Promise.resolve({ id: "proj-1" }) };

describe("/api/media-projects/[id]/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.mediaShareToken.findMany.mockResolvedValue([
      { id: "tok-1", token: "secret", type: "VALIDATOR" },
      { id: "tok-2", token: "public", type: "GALLERY" },
    ] as never);
  });

  it("GET masque les tokens sensibles sans media:manage, même pour l'équipe Visuels", async () => {
    mockRequireMediaAccess.mockResolvedValue(createDepartmentHeadSession([{ id: "dept-1", name: "Visuels" }]));
    const res = await GET(new Request("http://localhost/api/media-projects/proj-1/share"), ctx);
    const body = await res.json();
    expect(mockResolveChurchId).toHaveBeenCalledWith("mediaProject", "proj-1");
    expect(mockRequireMediaAccess).toHaveBeenCalledWith("church-1", "VISUELS");
    expect(prismaMock.mediaShareToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { mediaProjectId: "proj-1" } })
    );
    expect(mockIsMediaTeamMember).not.toHaveBeenCalled();
    expect(body[0]).not.toHaveProperty("token");
    expect(body[0]).not.toHaveProperty("url");
    expect(body[1]).toMatchObject({ token: "public", url: "http://localhost/media/gallery/public" });
  });

  it("GET montre les tokens sensibles avec media:manage", async () => {
    mockRequireMediaAccess.mockResolvedValue(createAdminSession());
    const res = await GET(new Request("http://localhost/api/media-projects/proj-1/share"), ctx);
    const body = await res.json();
    expect(body[0]).toMatchObject({ token: "secret", url: "http://localhost/media/validator/secret" });
  });

  it("POST crée un token rattaché au projet, avec media:manage pour un VALIDATOR", async () => {
    const res = await POST(
      new Request("http://localhost/api/media-projects/proj-1/share", {
        method: "POST",
        body: JSON.stringify({ type: "VALIDATOR", label: "Pasteur" }),
      }),
      ctx
    );
    expect(res.status).toBe(201);
    expect(mockRequireMediaManageAccess).toHaveBeenCalledWith("church-1", "VISUELS");
    expect(mockCreateToken).toHaveBeenCalledWith(
      expect.objectContaining({ churchId: "church-1", mediaProjectId: "proj-1", type: "VALIDATOR", label: "Pasteur" })
    );
    expect(prismaMock.mediaShareToken.count).not.toHaveBeenCalled();
  });

  it("DELETE exige tokenId, refuse un token inconnu et supprime dans le projet", async () => {
    let res = await DELETE(new Request("http://localhost/api/media-projects/proj-1/share", { method: "DELETE" }), ctx);
    expect(res.status).toBe(400);

    prismaMock.mediaShareToken.findUnique.mockResolvedValueOnce(null);
    res = await DELETE(new Request("http://localhost/x?tokenId=tok-9", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);

    prismaMock.mediaShareToken.findUnique.mockResolvedValueOnce({ type: "GALLERY" } as never);
    res = await DELETE(new Request("http://localhost/x?tokenId=tok-2", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(mockRequireMediaManageAccess).not.toHaveBeenCalled();
    expect(prismaMock.mediaShareToken.delete).toHaveBeenCalledWith({ where: { id: "tok-2", mediaProjectId: "proj-1" } });
  });
});
