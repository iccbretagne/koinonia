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
  return DELETE(new Request(`https://koinonia.test/api/care/requests/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe("DELETE /api/care/requests/[id] (spec 057)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(createAdminSession(churchId));
    prismaMock.appointmentRequest.findUnique.mockResolvedValue({ churchId } as never);
    prismaMock.appointmentRequest.findFirst.mockResolvedValue({ msdpFollowUp: null } as never);
    prismaMock.appointmentRequest.deleteMany.mockResolvedValue({ count: 1 } as never);
  });

  it("Admin : supprime la demande et son entrée d'agenda", async () => {
    const res = await call("r-1");

    expect(res.status).toBe(200);
    expect(prismaMock.agendaEntry.deleteMany).toHaveBeenCalledWith({ where: { requestId: "r-1" } });
    expect(prismaMock.appointmentRequest.deleteMany).toHaveBeenCalledWith({ where: { id: "r-1", churchId } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityId: "r-1" }));
  });

  it.each([
    ["Secrétaire", createSecretarySession],
    ["Référent soins pastoraux", createPastoralCareReferentSession],
    ["STAR", createStarSession],
  ])("%s : 403 sans rien supprimer", async (_label, makeSession) => {
    mockAuth.mockResolvedValue(makeSession(churchId));

    const res = await call("r-1");

    expect(res.status).toBe(403);
    expect(prismaMock.appointmentRequest.deleteMany).not.toHaveBeenCalled();
  });

  it("Admin d'une autre église : 403", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-2"));

    const res = await call("r-1");

    expect(res.status).toBe(403);
    expect(prismaMock.appointmentRequest.deleteMany).not.toHaveBeenCalled();
  });

  it("identifiant inconnu : 404", async () => {
    prismaMock.appointmentRequest.findUnique.mockResolvedValue(null);

    const res = await call("r-x");

    expect(res.status).toBe(404);
  });

  it("suivi de nouveau converti lié : 409", async () => {
    prismaMock.appointmentRequest.findFirst.mockResolvedValue({ msdpFollowUp: { id: "f-1" } } as never);

    const res = await call("r-1");

    expect(res.status).toBe(409);
    expect(prismaMock.appointmentRequest.deleteMany).not.toHaveBeenCalled();
  });
});
