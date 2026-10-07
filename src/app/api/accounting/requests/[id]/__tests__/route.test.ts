import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession } from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();
const mockGetCurrentChurchId = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: () => mockRequireAuth(),
  getCurrentChurchId: () => mockGetCurrentChurchId(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const mockCreateNotification = vi.fn();
vi.mock("@/lib/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));
vi.mock("@/lib/email", () => ({ buildAccountingStatusEmail: vi.fn().mockReturnValue({ subject: "s", html: "h" }) }));
const mockScope = vi.fn();
vi.mock("@/modules/accounting", () => ({ getAccountingDepartmentScope: (...a: unknown[]) => mockScope(...a) }));

const { GET, PATCH } = await import("../route");

const params = { params: Promise.resolve({ id: "req-1" }) };

function patch(body: Record<string, unknown>) {
  return PATCH(new Request("http://localhost/api/accounting/requests/req-1", { method: "PATCH", body: JSON.stringify(body) }), params);
}

function existing(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    churchId: "church-1",
    submittedById: "user-1",
    departmentId: "dept-a",
    status: "SUBMITTED",
    label: "Sono",
    amount: 120,
    seriesId: null,
    type: "PURCHASE",
    description: null,
    occurrenceNumber: null,
    ...overrides,
  };
}

const headSession = () => createDepartmentHeadSession([{ id: "dept-a", name: "A" }]);

describe("/api/accounting/requests/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
    mockGetCurrentChurchId.mockResolvedValue("church-1");
    prismaMock.financialRequest.update.mockImplementation(async ({ data }: { data: object }) => ({ id: "req-1", ...data }));
    prismaMock.user.findUnique.mockResolvedValue({ name: "Jean", email: "jean@x.fr" });
    prismaMock.church.findUnique.mockResolvedValue({ name: "ICC" });
  });

  describe("GET", () => {
    it("refuse sans église courante, sans accounting:view, ou hors église", async () => {
      mockGetCurrentChurchId.mockResolvedValueOnce(null);
      expect((await GET(new Request("http://x"), params)).status).toBe(400);

      prismaMock.financialRequest.findUnique.mockResolvedValue(existing({ churchId: "church-2" }));
      expect((await GET(new Request("http://x"), params)).status).toBe(404);
    });

    it("laisse un responsable lire une demande de son département, pas d'un autre", async () => {
      const session = headSession();
      session.user.id = "other";
      mockRequireAuth.mockResolvedValue(session);
      mockScope.mockResolvedValue(["dept-a"]);
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing());
      expect((await GET(new Request("http://x"), params)).status).toBe(200);

      prismaMock.financialRequest.findUnique.mockResolvedValue(existing({ departmentId: "dept-b" }));
      expect((await GET(new Request("http://x"), params)).status).toBe(403);
    });
  });

  describe("PATCH", () => {
    it("refuse une demande d'une autre église", async () => {
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing({ churchId: "church-2" }));
      expect((await patch({ action: "cancel" })).status).toBe(404);
    });

    it("laisse le demandeur annuler sa demande en attente", async () => {
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing());
      const res = await patch({ action: "cancel" });
      expect(res.status).toBe(200);
      expect(prismaMock.financialRequest.update).toHaveBeenCalledWith({ where: { id: "req-1" }, data: { status: "CANCELLED" } });
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ACCOUNTING_CANCELLED", title: "Demande annulée" }),
        { email: { subject: "s", html: "h" } }
      );
    });

    it("refuse l'annulation par un autre que le demandeur, ou après prise en charge", async () => {
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing({ submittedById: "someone" }));
      expect((await patch({ action: "cancel" })).status).toBe(403);
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing({ status: "PROCESSING" }));
      expect((await patch({ action: "cancel" })).status).toBe(400);
    });

    it("réserve les autres actions à accounting:manage", async () => {
      mockRequireAuth.mockResolvedValue(headSession());
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing());
      expect((await patch({ action: "process", priority: "NORMAL" })).status).toBe(403);
    });

    it("prend en charge une demande en attente, avec priorité urgente", async () => {
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing());
      const res = await patch({ action: "process", priority: "URGENT", priorityNote: "avant dimanche" });
      expect(res.status).toBe(200);
      expect(prismaMock.financialRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: expect.objectContaining({ status: "PROCESSING", priority: "URGENT", processedById: "user-1" }),
      });
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("priorité urgente — avant dimanche") }),
        expect.anything()
      );
    });

    it("refuse de prendre en charge une demande qui n'est plus en attente", async () => {
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing({ status: "APPROVED" }));
      expect((await patch({ action: "process", priority: "NORMAL" })).status).toBe(400);
    });

    it("valide une demande en cours avec son plan de paiement", async () => {
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing({ status: "PROCESSING" }));
      const res = await patch({
        action: "approve",
        payments: [{ amount: 120, scheduledDate: "2026-06-01T00:00:00.000Z", note: "en une fois" }],
      });
      expect(res.status).toBe(200);
      expect(prismaMock.financialPayment.createMany).toHaveBeenCalledWith({
        data: [{ requestId: "req-1", amount: 120, scheduledDate: new Date("2026-06-01T00:00:00.000Z"), note: "en une fois" }],
      });
      expect(prismaMock.financialRequest.create).not.toHaveBeenCalled();
    });

    it("crée l'occurrence suivante d'une série active à la validation", async () => {
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing({ status: "PROCESSING", seriesId: "s1", occurrenceNumber: 2 }));
      prismaMock.financialSeries.findUnique.mockResolvedValue({
        id: "s1", status: "ACTIVE", nextOccurrenceDate: new Date("2026-06-01"), recurrenceUnit: "WEEK", recurrenceEvery: 2, departmentId: "dept-a",
      });
      prismaMock.financialRequest.create.mockResolvedValue({ id: "req-2" });
      await patch({ action: "approve", payments: [{ amount: 10, scheduledDate: "2026-06-01T00:00:00.000Z" }] });
      expect(prismaMock.financialSeries.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { nextOccurrenceDate: new Date("2026-06-15") } });
      expect(prismaMock.financialRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ occurrenceNumber: 3, status: "SUBMITTED" }) })
      );
    });

    it("refuse de valider une demande qui n'est pas en cours", async () => {
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing());
      expect((await patch({ action: "approve", payments: [{ amount: 1, scheduledDate: "2026-06-01T00:00:00.000Z" }] })).status).toBe(400);
    });

    it("rejette une demande en attente avec son motif", async () => {
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing());
      const res = await patch({ action: "reject", rejectionReason: "Hors budget" });
      expect(res.status).toBe(200);
      expect(prismaMock.financialRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: expect.objectContaining({ status: "REJECTED", rejectionReason: "Hors budget" }),
      });
    });

    it("refuse de rejeter une demande déjà validée", async () => {
      prismaMock.financialRequest.findUnique.mockResolvedValue(existing({ status: "APPROVED" }));
      expect((await patch({ action: "reject", rejectionReason: "x" })).status).toBe(400);
    });
  });
});
