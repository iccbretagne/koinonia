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
  return DELETE(new Request(`https://koinonia.test/api/integration/requests/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe("DELETE /api/integration/requests/[id] (spec 057)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(createAdminSession(churchId));
    prismaMock.familyIntegrationRequest.findUnique.mockResolvedValue({ churchId } as never);
    prismaMock.familyIntegrationRequest.deleteMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.appointmentRequest.count.mockResolvedValue(0 as never);
    prismaMock.msdpFollowUp.count.mockResolvedValue(0 as never);
  });

  it("Admin : supprime la demande et journalise", async () => {
    const res = await call("int-1");

    expect(res.status).toBe(200);
    expect(prismaMock.familyIntegrationRequest.deleteMany).toHaveBeenCalledWith({ where: { id: "int-1", churchId } });
    expect(logAudit).toHaveBeenCalledWith({
      userId: expect.any(String),
      churchId,
      action: "DELETE",
      entityType: "FamilyIntegrationRequest",
      entityId: "int-1",
    });
  });

  it.each([
    ["Secrétaire (integration:manage)", createSecretarySession],
    ["Référent soins pastoraux", createPastoralCareReferentSession],
    ["STAR (équipe d'intégration)", createStarSession],
  ])("%s : 403 sans rien supprimer", async (_label, makeSession) => {
    mockAuth.mockResolvedValue(makeSession(churchId));

    const res = await call("int-1");

    expect(res.status).toBe(403);
    expect(prismaMock.familyIntegrationRequest.deleteMany).not.toHaveBeenCalled();
  });

  it("Admin d'une autre église : 403", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-2"));

    const res = await call("int-1");

    expect(res.status).toBe(403);
  });

  it("identifiant inconnu : 404", async () => {
    prismaMock.familyIntegrationRequest.findUnique.mockResolvedValue(null);

    const res = await call("int-x");

    expect(res.status).toBe(404);
  });

  it.each([
    ["un rendez-vous pastoral", 1, 0],
    ["un suivi de nouveau converti", 0, 1],
  ])("a donné lieu à %s : 409 sans rien supprimer", async (_label, appointments, followUps) => {
    prismaMock.appointmentRequest.count.mockResolvedValue(appointments as never);
    prismaMock.msdpFollowUp.count.mockResolvedValue(followUps as never);

    const res = await call("int-1");

    expect(res.status).toBe(409);
    expect(prismaMock.familyIntegrationRequest.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.notification.deleteMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
