import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const requireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ requireAuth: () => requireAuth() }));
const submitPieces = vi.fn();
vi.mock("@/modules/accounting", () => ({
  submitPieces: (...a: unknown[]) => submitPieces(...a),
  getRequestChurchId: async (id: string) => ((await prismaMock.financialRequest.findUnique({ where: { id } } as never)) as { churchId: string } | null)?.churchId ?? null,
}));

const { POST } = await import("../route");

const params = { params: Promise.resolve({ id: "req-1" }) };
const post = () => {
  const form = new FormData();
  form.append("files", new File([new Uint8Array(4)], "a.pdf", { type: "application/pdf" }));
  return new Request("http://x/api", { method: "POST", body: form });
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ user: { id: "user-1", name: "Marie", churchRoles: [{ churchId: "church-1", role: "STAR" }] } });
  prismaMock.financialRequest.findUnique.mockResolvedValue({ churchId: "church-1", submittedById: "user-1" });
  submitPieces.mockResolvedValue({ count: 1 });
});

describe("POST /api/accounting/requests/[id]/pieces", () => {
  it("dépose pour un membre de l'église de la demande, même STAR", async () => {
    const res = await POST(post(), params);
    expect(res.status).toBe(201);
    expect(submitPieces.mock.calls[0][2]).toHaveLength(1);
  });

  it("404 si la demande est d'une autre église", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue({ churchId: "church-2", submittedById: "user-1" });
    expect((await POST(post(), params)).status).toBe(404);
    expect(submitPieces).not.toHaveBeenCalled();
  });

  it("404 si la demande n'existe pas", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(null);
    expect((await POST(post(), params)).status).toBe(404);
  });
});
