import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createSession } from "@/__mocks__/auth";

const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const mockNotify = vi.fn(async () => undefined);
vi.mock("@/lib/notifications", () => ({ createNotification: (...args: unknown[]) => mockNotify(...(args as [])) }));

const { PATCH } = await import("../route");

const existing = (overrides: Record<string, unknown> = {}) => ({
  id: "req-1",
  submittedById: "user-requester",
  churchId: "church-1",
  type: "DIFFUSION_INTERNE",
  status: "EN_ATTENTE",
  title: "Soirée louange",
  announcementId: null,
  payload: { brief: "texte" },
  ...overrides,
});

function patch(body: Record<string, unknown>) {
  return PATCH(new Request("http://localhost/api/requests/req-1", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "req-1" }),
  });
}

/** Le demandeur, sans droit de traitement (STAR). */
function requesterSession() {
  return createSession({
    id: "user-requester",
    churchRoles: [
      { id: "r", churchId: "church-1", role: "STAR", ministryId: null, church: { id: "church-1", name: "C", slug: "c" }, departments: [] },
    ],
  });
}

describe("PATCH /api/requests/[id] — file de traitement (spec 063)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.department.findMany.mockResolvedValue([]);
    prismaMock.request.findUnique.mockResolvedValue(existing() as never);
    prismaMock.request.update.mockImplementation((async (args: { data: { status?: string } }) => ({
      id: "req-1",
      type: "DIFFUSION_INTERNE",
      status: args.data.status ?? "EN_ATTENTE",
    })) as never);
  });

  it("409 si la demande n'est plus dans l'état attendu", async () => {
    prismaMock.request.findUnique
      .mockResolvedValueOnce(existing() as never)
      .mockResolvedValueOnce({ status: "EN_COURS" } as never);
    const res = await patch({ status: "LIVRE", expectedStatus: "EN_ATTENTE" });
    expect(res.status).toBe(409);
    expect(prismaMock.request.update).not.toHaveBeenCalled();
  });

  it("accepte l'action quand l'état attendu correspond", async () => {
    prismaMock.request.findUnique
      .mockResolvedValueOnce(existing() as never)
      .mockResolvedValueOnce({ status: "EN_ATTENTE" } as never);
    const res = await patch({ status: "EN_COURS", expectedStatus: "EN_ATTENTE" });
    expect(res.status).toBe(200);
  });

  it("annulation par l'équipe sans motif : 400", async () => {
    const res = await patch({ status: "ANNULE" });
    expect(res.status).toBe(400);
    expect(prismaMock.request.update).not.toHaveBeenCalled();
  });

  it("annulation par l'équipe avec motif : enregistrée, le demandeur reçoit le motif", async () => {
    const res = await patch({ status: "ANNULE", reviewNotes: "Événement reporté" });
    expect(res.status).toBe(200);
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-requester",
        domain: "requests",
        type: "REQUEST_CANCELLED",
        title: "Demande annulée",
        message: expect.stringContaining("Motif : Événement reporté"),
      })
    );
  });

  it("le demandeur annule sa propre demande en attente sans motif, sans se notifier", async () => {
    mockRequirePermission.mockResolvedValue(requesterSession());
    const res = await patch({ status: "ANNULE" });
    expect(res.status).toBe(200);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("retour arrière : une demande livrée revient en cours", async () => {
    prismaMock.request.findUnique
      .mockResolvedValueOnce(existing({ status: "LIVRE" }) as never)
      .mockResolvedValueOnce({ status: "LIVRE" } as never);
    const res = await patch({ status: "EN_COURS", expectedStatus: "LIVRE" });
    expect(res.status).toBe(200);
    expect(prismaMock.request.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "EN_COURS" }) }));
  });

  it("retour arrière d'une prise en charge de visuel : rattachement au projet retiré", async () => {
    prismaMock.request.findUnique
      .mockResolvedValueOnce(existing({ type: "VISUEL", status: "EN_COURS", payload: { brief: "texte", mediaProjectId: "proj-1" } }) as never)
      .mockResolvedValueOnce({ status: "EN_COURS" } as never);
    const res = await patch({ status: "EN_ATTENTE", expectedStatus: "EN_COURS", payload: { mediaProjectId: null } });
    expect(res.status).toBe(200);
    expect(prismaMock.request.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payload: { brief: "texte", mediaProjectId: null } }) })
    );
  });
});
