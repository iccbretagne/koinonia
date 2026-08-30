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
vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return {
    ...actual,
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
    buildAccountingNewRequestEmail: () => ({ subject: "subject", html: "<p>html</p>" }),
  };
});

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

describe("POST /api/accounting/requests — notification emails multiples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentChurchPermission.mockResolvedValue(baseSession);
    prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock));
    prismaMock.financialRequest.create.mockResolvedValue(createdRequest);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    prismaMock.notification.createMany.mockResolvedValue({ count: 0 });
  });

  it("envoie un seul email à toutes les adresses comptabilité configurées", async () => {
    prismaMock.church.findUnique.mockResolvedValue({
      accountingEmails: "compta@icc.fr, responsable@icc.fr",
      name: "ICC Rennes",
    });

    const res = await POST(postRequest({ type: "EXPENSE_REPORT", label: "Taxi", amount: 42 }));
    expect(res.status).toBe(201);

    await vi.waitFor(() => expect(mockSendEmail).toHaveBeenCalled());
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["compta@icc.fr", "responsable@icc.fr"] })
    );
  });

  it("n'envoie aucun email quand aucune adresse comptabilité n'est configurée", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ accountingEmails: null, name: "ICC Rennes" });

    const res = await POST(postRequest({ type: "EXPENSE_REPORT", label: "Taxi", amount: 42 }));
    expect(res.status).toBe(201);

    // Laisse le temps à la notification fire-and-forget de s'exécuter
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("continue de fonctionner avec une seule adresse configurée (non-régression)", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ accountingEmails: "compta@icc.fr", name: "ICC Rennes" });

    const res = await POST(postRequest({ type: "EXPENSE_REPORT", label: "Taxi", amount: 42 }));
    expect(res.status).toBe(201);

    await vi.waitFor(() => expect(mockSendEmail).toHaveBeenCalled());
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ["compta@icc.fr"] }));
  });
});
