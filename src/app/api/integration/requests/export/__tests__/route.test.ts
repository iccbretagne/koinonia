import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireExportAccess = vi.fn();
const mockLogAudit = vi.fn();

// Le module entier est mocké : la garde par un espion, la projection par un passe-plat
// (une ligne par demande reçue). La correction de la projection est couverte à part par
// `export-service.test.ts` ; ce test-ci ne vérifie que le contrat de la route.
vi.mock("@/modules/integration", () => ({
  requireIntegrationExportAccess: (...args: unknown[]) => mockRequireExportAccess(...args),
  buildIntegrationExportRows: (reqs: unknown[]) => reqs.map(() => ({ Nom: "x" })),
  EXPORT_COLUMNS: ["Nom"],
}));

vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => mockLogAudit(...args) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { POST } = await import("../route");

const requestRow = {
  id: "req-1",
  firstName: "Marie",
  lastName: "Durand",
  phone: "0612345678",
  email: "marie@exemple.fr",
  city: "Rennes",
  ageRange: "ADULT",
  churchStatus: "VISITOR",
  salvationCall: true,
  pastoralCareRequested: false,
  assignedFamilyName: "Famille Nord",
  assignedBerger: { name: "Paul Berger", displayName: null },
  status: "CONTACTED",
  submittedAt: new Date("2026-09-01"),
  assignedAt: new Date("2026-09-03"),
  contactedAt: new Date("2026-09-05"),
  whatsappAddedAt: null,
  integratedAt: null,
};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/integration/requests/export", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/integration/requests/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireExportAccess.mockResolvedValue({ session: createAdminSession() });
    prismaMock.familyIntegrationRequest.findMany.mockResolvedValue([requestRow] as never);
  });

  it("renvoie 403 quand l'accès à l'intégration est refusé", async () => {
    mockRequireExportAccess.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await post({ churchId: "church-1", requestIds: ["req-1"] })).status).toBe(403);
  });

  it("renvoie 403 pour un berger au périmètre restreint", async () => {
    // La garde métier lève FORBIDDEN sur scope.scoped — vérifié indépendamment de l'UI.
    mockRequireExportAccess.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await post({ churchId: "church-1", requestIds: ["req-1"] });
    expect(res.status).toBe(403);
    expect(prismaMock.familyIntegrationRequest.findMany).not.toHaveBeenCalled();
  });

  it("renvoie 400 sur un corps invalide", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ churchId: "church-1", requestIds: [] })).status).toBe(400);
    expect(
      (await post({ churchId: "church-1", requestIds: Array(2001).fill("x") })).status
    ).toBe(400);
  });

  it("filtre la requête sur churchId ET archivedAt: null", async () => {
    await post({ churchId: "church-1", requestIds: ["req-1", "req-autre-eglise"] });
    expect(prismaMock.familyIntegrationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["req-1", "req-autre-eglise"] },
          churchId: "church-1",
          archivedAt: null,
        }),
      })
    );
  });

  it("génère un xlsx et journalise l'export avec le nombre de lignes écrites", async () => {
    const res = await post({ churchId: "church-1", requestIds: ["req-1", "req-hors-perimetre"] });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    expect(res.headers.get("Content-Disposition")).toContain(
      `demandes-integration-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    // 2 IDs demandés, 1 seule ligne renvoyée par Prisma → le journal compte 1.
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EXPORT", details: { count: 1 } })
    );
  });
});
