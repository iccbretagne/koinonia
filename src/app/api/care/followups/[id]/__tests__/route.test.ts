import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createSecretarySession,
  createPastoralCareReferentSession,
  createStarSession,
} from "@/__mocks__/auth";

const mockAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});

const { logAudit } = await import("@/lib/audit");
const { DELETE } = await import("../route");

const churchId = "church-1";

function call(id: string) {
  return DELETE(new Request(`https://koinonia.test/api/care/followups/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe("DELETE /api/care/followups/[id] (spec 057)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(createAdminSession(churchId));
    prismaMock.msdpFollowUp.findUnique.mockResolvedValue({ id: "f-1", churchId } as never);
    prismaMock.msdpFollowUp.deleteMany.mockResolvedValue({ count: 1 } as never);
  });

  it("Admin : supprime le suivi", async () => {
    const res = await call("f-1");

    expect(res.status).toBe(200);
    expect(prismaMock.msdpFollowUp.deleteMany).toHaveBeenCalledWith({ where: { id: "f-1", churchId } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "MsdpFollowUp" }));
  });

  it.each([
    ["Secrétaire", createSecretarySession],
    ["Référent soins pastoraux", createPastoralCareReferentSession],
    ["STAR (équipe MSDP)", createStarSession],
  ])("%s : 403 sans rien supprimer", async (_label, makeSession) => {
    mockAuth.mockResolvedValue(makeSession(churchId));

    const res = await call("f-1");

    expect(res.status).toBe(403);
    expect(prismaMock.msdpFollowUp.deleteMany).not.toHaveBeenCalled();
  });

  it("Admin d'une autre église : 403", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-2"));

    const res = await call("f-1");

    expect(res.status).toBe(403);
  });

  it("identifiant inconnu : 404", async () => {
    prismaMock.msdpFollowUp.findUnique.mockResolvedValue(null);

    const res = await call("f-x");

    expect(res.status).toBe(404);
  });
});
