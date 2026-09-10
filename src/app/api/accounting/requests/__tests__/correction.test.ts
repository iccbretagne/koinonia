import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createStarSession } from "@/__mocks__/auth";

const mockRequireCurrentChurchPermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireCurrentChurchPermission: (...args: unknown[]) => mockRequireCurrentChurchPermission(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
// Même raison que notify.test.ts : la chaîne de boot remonte jusqu'à NextAuth(...).
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return { ...actual, sendEmail: vi.fn().mockResolvedValue(undefined) };
});

const { POST } = await import("../route");

function postRequest(body: unknown) {
  return new Request("http://localhost/api/accounting/requests", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const session = createStarSession();

describe("POST /api/accounting/requests — correction d'une demande rejetée", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentChurchPermission.mockResolvedValue({ session, churchId: "church-1" });
    prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock));
    prismaMock.financialRequest.create.mockResolvedValue({
      id: "req-2", label: "Taxi", type: "EXPENSE_REPORT", description: null, amount: 42,
      department: null, submittedBy: { id: session.user.id, name: "Alice", email: null },
      attachments: [], payments: [],
    } as never);
    prismaMock.church.findUnique.mockResolvedValue({ accountingEmails: null, name: "ICC" } as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
  });

  it("lie la nouvelle demande à sa propre demande rejetée", async () => {
    prismaMock.financialRequest.findFirst.mockResolvedValue({ id: "req-1" } as never);

    const res = await POST(postRequest({ type: "EXPENSE_REPORT", label: "Taxi", amount: 42, correctionOfId: "req-1" }));

    expect(res.status).toBe(201);
    expect(prismaMock.financialRequest.findFirst).toHaveBeenCalledWith({
      where: { id: "req-1", churchId: "church-1", submittedById: session.user.id, status: "REJECTED" },
      select: { id: true },
    });
    expect(prismaMock.financialRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ correctionOfId: "req-1" }) })
    );
  });

  it("refuse (404) une demande à corriger qui n'est pas la sienne, pas rejetée ou d'une autre église", async () => {
    prismaMock.financialRequest.findFirst.mockResolvedValue(null);

    const res = await POST(postRequest({ type: "EXPENSE_REPORT", label: "Taxi", amount: 42, correctionOfId: "req-autre" }));

    expect(res.status).toBe(404);
    expect(prismaMock.financialRequest.create).not.toHaveBeenCalled();
  });

  it("une demande sans correction n'interroge pas la demande d'origine (non-régression)", async () => {
    const res = await POST(postRequest({ type: "EXPENSE_REPORT", label: "Taxi", amount: 42 }));

    expect(res.status).toBe(201);
    expect(prismaMock.financialRequest.findFirst).not.toHaveBeenCalled();
  });
});
