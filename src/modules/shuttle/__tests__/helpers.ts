import { vi } from "vitest";

/** Une vraie signature JPEG (le type est vérifié sur le contenu). */
export const jpegFile = (name = "ticket.jpg", size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return new File([bytes], name, { type: "image/jpeg" });
};

export const accountingMocks = {
  getRequestsProgress: vi.fn(),
  listReleasedBudgetAdvances: vi.fn(),
  listDepartmentExpenseReports: vi.fn(),
  createLinkedExpenseReport: vi.fn(),
  cancelOwnRequest: vi.fn(),
};

export function resetAccountingMocks() {
  accountingMocks.getRequestsProgress.mockResolvedValue([]);
  accountingMocks.listReleasedBudgetAdvances.mockResolvedValue([]);
  accountingMocks.listDepartmentExpenseReports.mockResolvedValue([]);
  accountingMocks.createLinkedExpenseReport.mockResolvedValue({ id: "req-1" });
  accountingMocks.cancelOwnRequest.mockResolvedValue(true);
}

/** Ligne de registre telle que Prisma la renvoie. */
export function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    churchId: "church-1",
    kind: "EXPENSE",
    category: "FUEL",
    amount: -50,
    date: new Date("2026-11-02T00:00:00Z"),
    label: null,
    vendor: "Super U Location",
    paymentMethod: null,
    liters: null,
    kilometers: null,
    personalAdvance: false,
    rentalId: null,
    returnOfId: null,
    depositRetainedAt: null,
    depositRetainedNote: null,
    reimbursementRequestId: null,
    sourceRequestId: null,
    receiptKey: "shuttle/church-1/x.jpg",
    receiptName: "ticket.jpg",
    receiptMime: "image/jpeg",
    receiptSize: 64,
    flagNote: null,
    flaggedAt: null,
    flaggedById: null,
    createdById: "member-1",
    updatedById: "member-1",
    deletedAt: null,
    deletedById: null,
    createdAt: new Date("2026-11-02T10:00:00Z"),
    updatedAt: new Date("2026-11-02T10:00:00Z"),
    createdBy: { id: "member-1", name: "Marc", email: "marc@example.com" },
    rental: null,
    returnedBy: null,
    ...overrides,
  };
}
