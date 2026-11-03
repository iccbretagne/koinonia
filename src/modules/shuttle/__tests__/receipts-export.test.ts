import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { accountingMocks, entryRow, resetAccountingMocks } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const readStoredFile = vi.fn();
vi.mock("@/lib/file-storage", () => ({ storeFile: vi.fn(), readStoredFile: (...a: unknown[]) => readStoredFile(...a) }));
vi.mock("@/modules/accounting", () => accountingMocks);

const { sniffReceiptType } = await import("../services/receipts");
const { buildShuttleExport } = await import("../services/export");

describe("justificatifs (spec 073)", () => {
  it.each([
    [[0xff, 0xd8, 0xff, 0xe1], "image/jpeg"],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
    [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], "image/webp"],
    [[0x25, 0x50, 0x44, 0x46, 0x2d], "application/pdf"],
  ])("%j → %s", (bytes, mime) => {
    expect(sniffReceiptType(new Uint8Array(bytes))).toBe(mime);
  });

  it("refuse un SVG, un GIF ou un texte", () => {
    expect(sniffReceiptType(new TextEncoder().encode("<svg xmlns"))).toBeNull();
    expect(sniffReceiptType(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
});

describe("export d'une période (spec 073)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAccountingMocks();
    prismaMock.department.findMany.mockResolvedValue([]);
    prismaMock.shuttleEntry.findMany.mockImplementation(async (args: { select?: unknown }) =>
      args.select
        ? [{ id: "in", receiptKey: "shuttle/church-1/in.jpg" }]
        : [
            entryRow({ id: "in", amount: -40, date: new Date("2026-10-10T00:00:00Z") }),
            entryRow({ id: "out", amount: -10, date: new Date("2026-09-10T00:00:00Z") }),
          ]
    );
    readStoredFile.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it("contient le relevé et les seuls justificatifs de la période", async () => {
    const zip = await buildShuttleExport("church-1", { from: "2026-10-01", to: "2026-10-31" });
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    const names = zip.toString("latin1");
    expect(names).toContain("releve.xlsx");
    expect(names).toMatch(/justificatifs\/2026-10-10_Carburant_40\.00_[a-z0-9]+\.jpg/);
    expect(names).not.toContain("2026-09-10_");
    expect(readStoredFile).toHaveBeenCalledTimes(1);
  });
});
