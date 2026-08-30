/**
 * Tests — spec 025 (H-03) : autorisation objet des pièces justificatives comptables,
 * bout en bout (routes de création de demande et de consultation d'une pièce).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession, createAdminSession } from "@/__mocks__/auth";

const mockRequireCurrentChurchPermission = vi.fn();
const mockRequireAuth = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireCurrentChurchPermission: (...args: unknown[]) =>
    mockRequireCurrentChurchPermission(...args),
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
  buildAccountingNewRequestEmail: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
  parseEmailList: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/file-storage", () => ({
  getFileUrl: vi.fn().mockResolvedValue("https://example.com/signed-url"),
  deleteFile: vi.fn(),
}));
// canReadAttachment (via @/modules/accounting) importe dynamiquement @/lib/registry, qui charge
// la chaîne de boot jusqu'à @/lib/auth (NextAuth(...)) — mock requis hors contexte Next.js.
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const { POST: postRequest } = await import("../requests/route");
const { GET: getAttachment } = await import("../attachments/[id]/route");

const makeParams = (id: string) => Promise.resolve({ id });

const requestBody = (attachmentIds?: string[]) =>
  new Request("http://localhost/api/accounting/requests", {
    method: "POST",
    body: JSON.stringify({
      type: "EXPENSE_REPORT",
      label: "Frais de déplacement",
      amount: 42,
      ...(attachmentIds ? { attachmentIds } : {}),
    }),
  });

describe("POST /api/accounting/requests — autorisation des pièces jointes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentChurchPermission.mockResolvedValue({
      session: createSession({ id: "user-1" }),
      churchId: "church-1",
    });
  });

  it("refuse une pièce déposée par quelqu'un d'autre — aucune demande créée", async () => {
    prismaMock.financialAttachment.count.mockResolvedValue(0);

    const res = await postRequest(requestBody(["att-of-someone-else"]));

    expect(res.status).toBe(403);
    expect(prismaMock.financialRequest.create).not.toHaveBeenCalled();
  });

  it("refuse une pièce déjà rattachée à une autre demande", async () => {
    prismaMock.financialAttachment.count.mockResolvedValue(0);

    const res = await postRequest(requestBody(["att-already-linked"]));

    expect(res.status).toBe(403);
    expect(prismaMock.financialRequest.create).not.toHaveBeenCalled();
  });

  it("refuse une pièce d'une autre église", async () => {
    prismaMock.financialAttachment.count.mockResolvedValue(0);

    const res = await postRequest(requestBody(["att-other-church"]));

    expect(res.status).toBe(403);
    expect(prismaMock.financialRequest.create).not.toHaveBeenCalled();
  });

  it("un lot mixte (une pièce valide, une invalide) est refusé dans son ensemble", async () => {
    // 2 ids demandés, un seul valide → count=1 ≠ 2 → rejet global, aucun rattachement partiel.
    prismaMock.financialAttachment.count.mockResolvedValue(1);

    const res = await postRequest(requestBody(["att-valid", "att-invalid"]));

    expect(res.status).toBe(403);
    expect(prismaMock.financialRequest.create).not.toHaveBeenCalled();
  });

  it("accepte la création avec ses propres pièces orphelines (non-régression)", async () => {
    prismaMock.financialAttachment.count.mockResolvedValue(1);
    prismaMock.financialRequest.create.mockResolvedValue({
      id: "req-1",
      type: "EXPENSE_REPORT",
      label: "Frais de déplacement",
      amount: 42,
      description: null,
      department: null,
      submittedBy: { name: "Test User", email: "test@example.com" },
    } as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    prismaMock.church.findUnique.mockResolvedValue(null);

    const res = await postRequest(requestBody(["att-mine"]));

    expect(res.status).toBe(201);
    expect(prismaMock.financialRequest.create).toHaveBeenCalled();
  });

  it("accepte la création sans pièce jointe (non-régression)", async () => {
    prismaMock.financialRequest.create.mockResolvedValue({
      id: "req-2",
      type: "EXPENSE_REPORT",
      label: "Frais de déplacement",
      amount: 42,
      description: null,
      department: null,
      submittedBy: { name: "Test User", email: "test@example.com" },
    } as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    prismaMock.church.findUnique.mockResolvedValue(null);

    const res = await postRequest(requestBody());

    expect(res.status).toBe(201);
    expect(prismaMock.financialAttachment.count).not.toHaveBeenCalled();
  });
});

describe("GET /api/accounting/attachments/[id] — lecture de la pièce d'un tiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse la lecture avec accounting:submit seul (MINISTER)", async () => {
    mockRequireAuth.mockResolvedValue(
      createSession({
        id: "user-2",
        churchRoles: [
          {
            id: "role-1",
            churchId: "church-1",
            role: "MINISTER",
            ministryId: null,
            church: { id: "church-1", name: "Test Church", slug: "test-church" },
            departments: [],
          },
        ],
      })
    );
    prismaMock.financialAttachment.findUnique.mockResolvedValue({
      id: "att-1",
      uploadedById: "someone-else",
      churchId: "church-1",
      s3Key: "accounting/church-1/x.pdf",
      filename: "justificatif.pdf",
      mimeType: "application/pdf",
    } as never);

    const res = await getAttachment(new Request("http://localhost"), {
      params: makeParams("att-1"),
    });

    expect(res.status).toBe(403);
  });

  it("autorise la lecture avec accounting:manage dans l'église de la pièce", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.financialAttachment.findUnique.mockResolvedValue({
      id: "att-1",
      uploadedById: "someone-else",
      churchId: "church-1",
      s3Key: "accounting/church-1/x.pdf",
      filename: "justificatif.pdf",
      mimeType: "application/pdf",
    } as never);

    const res = await getAttachment(new Request("http://localhost"), {
      params: makeParams("att-1"),
    });

    expect(res.status).toBe(200);
  });

  it("autorise le déposant à lire sa propre pièce", async () => {
    mockRequireAuth.mockResolvedValue(createSession({ id: "user-3" }));
    prismaMock.financialAttachment.findUnique.mockResolvedValue({
      id: "att-1",
      uploadedById: "user-3",
      churchId: "church-1",
      s3Key: "accounting/church-1/x.pdf",
      filename: "justificatif.pdf",
      mimeType: "application/pdf",
    } as never);

    const res = await getAttachment(new Request("http://localhost"), {
      params: makeParams("att-1"),
    });

    expect(res.status).toBe(200);
  });

  it("refuse la lecture inter-églises même avec accounting:manage dans une AUTRE église", async () => {
    // ADMIN de l'église A, mais la pièce relève de l'église B — l'autorité est attachment.churchId,
    // jamais un contexte affiché manipulable côté client.
    mockRequireAuth.mockResolvedValue(createAdminSession("church-A"));
    prismaMock.financialAttachment.findUnique.mockResolvedValue({
      id: "att-1",
      uploadedById: "someone-else",
      churchId: "church-B",
      s3Key: "accounting/church-B/x.pdf",
      filename: "justificatif.pdf",
      mimeType: "application/pdf",
    } as never);

    const res = await getAttachment(new Request("http://localhost"), {
      params: makeParams("att-1"),
    });

    expect(res.status).toBe(403);
  });

  it("retourne 404 pour une pièce inexistante", async () => {
    mockRequireAuth.mockResolvedValue(createSession({ id: "user-1" }));
    prismaMock.financialAttachment.findUnique.mockResolvedValue(null);

    const res = await getAttachment(new Request("http://localhost"), {
      params: makeParams("missing"),
    });

    expect(res.status).toBe(404);
  });
});
