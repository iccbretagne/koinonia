/**
 * Spec 092, lot 3 (T3.3, T3.13) — lecture pastorale des demandes comptables : un profil pastoral
 * sans rôle lit le détail de toute demande de SON église (sans email du demandeur ni clé de
 * pièce), jamais d'une autre ; toute écriture, tout dépôt et tout téléchargement de pièce lui
 * restent refusés. Les gardes réelles de `@/lib/auth` sont exercées (seuls `auth()` et le
 * cookie d'église sont simulés).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession } from "@/__mocks__/auth";

const mockAuth = vi.fn();
let currentChurch: string | undefined = "church-1";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/file-storage", () => ({
  getFileUrl: vi.fn().mockResolvedValue("https://signed"),
  storeFile: vi.fn(),
  deleteFile: vi.fn(),
  readFile: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (k === "current-church" && currentChurch ? { value: currentChurch } : undefined) }),
}));
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});

const detail = await import("../requests/[id]/route");
const list = await import("../requests/route");
const attachments = await import("../attachments/route");
const attachment = await import("../attachments/[id]/route");
const pieces = await import("../requests/[id]/pieces/route");
const payment = await import("../payments/[id]/route");

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const pastor = () => createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] } as never);

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    churchId: "church-1",
    submittedById: "someone",
    departmentId: "dept-x",
    status: "SUBMITTED",
    label: "Sono",
    amount: 120,
    submittedBy: { id: "someone", name: "Jean", email: "jean@example.org" },
    attachments: [{ id: "att-1", filename: "facture.pdf", mimeType: "application/pdf", size: 10, s3Key: "accounting/church-1/secret.pdf" }],
    payments: [],
    corrections: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentChurch = "church-1";
  mockAuth.mockResolvedValue(pastor());
});

describe("GET /api/accounting/requests/[id] — lecture pastorale", () => {
  it("pasteur sans rôle : 200 sur une demande de son église hors de tout département, sans email ni clé de pièce", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request() as never);
    const res = await detail.GET(new Request("http://x"), params("req-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.readOnly).toBe(true);
    expect(body.submittedBy.email).toBeNull();
    expect(body.attachments[0]).toEqual({ id: "att-1", filename: "facture.pdf", mimeType: "application/pdf", size: 10 });
    expect(JSON.stringify(body)).not.toContain("secret.pdf");
  });

  it("demande d'une autre église : 404", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request({ churchId: "church-2" }) as never);
    expect((await detail.GET(new Request("http://x"), params("req-1"))).status).toBe(404);
  });

  it("église courante forcée sur une église sans profil pastoral : refus", async () => {
    currentChurch = "church-2";
    mockAuth.mockResolvedValue(createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] } as never));
    // Le cookie est ignoré (aucun rattachement à church-2) : retour à church-1, demande de church-2 ⇒ 404.
    prismaMock.financialRequest.findUnique.mockResolvedValue(request({ churchId: "church-2" }) as never);
    expect((await detail.GET(new Request("http://x"), params("req-1"))).status).toBe(404);
  });

  it("compte sans rôle ni profil pastoral : 403", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [], pastoralChurchIds: [] } as never));
    currentChurch = undefined;
    const res = await detail.GET(new Request("http://x"), params("req-1"));
    expect([400, 403]).toContain(res.status);
  });
});

describe("écritures refusées au pasteur sans rôle", () => {
  beforeEach(() => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request() as never);
  });

  it.each([
    { action: "process", priority: "NORMAL" },
    { action: "approve", payments: [{ amount: 1, scheduledDate: "2026-06-01T00:00:00.000Z" }] },
    { action: "reject", rejectionReason: "x" },
    { action: "cancel" },
    { action: "claimJustification" },
    { action: "requestPiece" },
    { action: "cancelPieceRequest" },
    { action: "archive" },
    { action: "unarchive" },
  ])("PATCH $action : 403", async (body) => {
    const res = await detail.PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }),
      params("req-1")
    );
    expect(res.status).toBe(403);
    expect(prismaMock.financialRequest.update).not.toHaveBeenCalled();
  });

  it("POST /api/accounting/requests (nouvelle demande) : 403", async () => {
    const res = await list.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ type: "PURCHASE", label: "x", amount: 1 }) }));
    expect(res.status).toBe(403);
    expect(prismaMock.financialRequest.create).not.toHaveBeenCalled();
  });

  it("POST /api/accounting/attachments (dépôt de pièce) : 403", async () => {
    const form = new FormData();
    form.append("file", new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
    form.append("requestId", "req-1");
    const res = await attachments.POST(new Request("http://x", { method: "POST", body: form }));
    expect(res.status).toBe(403);
    expect(prismaMock.financialAttachment.create).not.toHaveBeenCalled();
  });

  it("POST …/requests/[id]/pieces (pièce demandée) : refusé", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue({ churchId: "church-1" } as never);
    const form = new FormData();
    form.append("files", new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
    const res = await pieces.POST(new Request("http://x", { method: "POST", body: form }), params("req-1"));
    expect([403, 404]).toContain(res.status);
    expect(prismaMock.financialAttachment.createMany).not.toHaveBeenCalled();
  });

  it("PATCH /api/accounting/payments/[id] (remise) : 403", async () => {
    const res = await payment.PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({}) }), params("pay-1"));
    expect(res.status).toBe(403);
  });
});

describe("pièces justificatives jamais téléchargeables en lecture pastorale", () => {
  beforeEach(() => {
    prismaMock.financialAttachment.findUnique.mockResolvedValue({
      id: "att-1", churchId: "church-1", uploadedById: "someone", s3Key: "k", filename: "facture.pdf", mimeType: "application/pdf",
    } as never);
  });

  it("GET /api/accounting/attachments/[id] : 403", async () => {
    expect((await attachment.GET(new Request("http://x/api/accounting/attachments/att-1"), params("att-1"))).status).toBe(403);
  });

  it("GET /api/accounting/attachments/[id]?inline=1 : 403", async () => {
    expect((await attachment.GET(new Request("http://x/api/accounting/attachments/att-1?inline=1"), params("att-1"))).status).toBe(403);
  });

  it("DELETE /api/accounting/attachments/[id] : 403", async () => {
    prismaMock.financialAttachment.findUnique.mockResolvedValue({
      id: "att-1", uploadedById: "someone", s3Key: "k", request: { submittedById: "someone", status: "SUBMITTED" }, justification: null,
    } as never);
    expect((await attachment.DELETE(new Request("http://x", { method: "DELETE" }), params("att-1"))).status).toBe(403);
    expect(prismaMock.financialAttachment.delete).not.toHaveBeenCalled();
  });
});
