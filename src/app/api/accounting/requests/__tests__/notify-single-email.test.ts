import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createStarSession } from "@/__mocks__/auth";

const mockRequireCurrentChurchPermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireCurrentChurchPermission: (...args: unknown[]) => mockRequireCurrentChurchPermission(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
// assertAttachmentsAssignable (via @/modules/accounting) importe dynamiquement @/lib/registry,
// qui charge la chaîne de boot jusqu'à @/lib/auth (NextAuth(...)) — mock requis hors contexte Next.js.
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
const mockBuildEmail = vi.fn().mockReturnValue({ subject: "subject", html: "<p>html</p>" });
vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return {
    ...actual,
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
    buildAccountingNewRequestEmail: (...args: unknown[]) => mockBuildEmail(...args),
  };
});

const mockNotifyUsers = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => mockNotifyUsers(...a) }));

const { POST } = await import("../route");

function postRequest(body: unknown) {
  return new Request("http://localhost/api/accounting/requests", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const baseSession = { session: createStarSession(), churchId: "church-1" };

const createdRequest = {
  id: "req-1",
  label: "Taxi",
  type: "EXPENSE_REPORT",
  description: null,
  amount: 42,
  department: null,
  submittedBy: { id: "user-1", name: "Alice", email: "alice@icc.fr" },
  attachments: [],
  payments: [],
};

describe("POST /api/accounting/requests — un seul email par comptable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentChurchPermission.mockResolvedValue(baseSession);
    prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock));
    prismaMock.financialRequest.create.mockResolvedValue(createdRequest);
    prismaMock.church.findUnique.mockResolvedValue({ accountingEmails: null, name: "ICC Rennes" });
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "acc-1" }] as never);
  });

  it("passe le gabarit détaillé à la notification (pas d'email générique en plus)", async () => {
    await POST(postRequest({ type: "EXPENSE_REPORT", label: "Taxi", amount: 42 }));

    await vi.waitFor(() => expect(mockNotifyUsers).toHaveBeenCalledTimes(1));
    expect(mockNotifyUsers).toHaveBeenCalledWith(
      ["acc-1"],
      expect.objectContaining({ domain: "accounting", type: "ACCOUNTING_NEW_REQUEST" }),
      { email: { subject: "subject", html: "<p>html</p>" } }
    );
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
