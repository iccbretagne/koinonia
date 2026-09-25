import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { listRelatedItems } = await import("../services/related");

describe("listRelatedItems", () => {
  beforeEach(() => vi.clearAllMocks());

  it("réunit les demandes et les suivis du même dossier de parcours, triés du plus récent au plus ancien", async () => {
    prismaMock.appointmentRequest.findMany.mockResolvedValue([
      { id: "req-1", status: "CLOSED", createdAt: new Date("2026-01-01T10:00:00Z") },
    ] as never);
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([
      { id: "followup-1", status: "COMPLETED", createdAt: new Date("2026-03-01T10:00:00Z") },
    ] as never);

    const items = await listRelatedItems("journey-1", { kind: "request", id: "req-current" });

    expect(items).toEqual([
      { kind: "followup", id: "followup-1", status: "COMPLETED", createdAt: new Date("2026-03-01T10:00:00Z") },
      { kind: "request", id: "req-1", status: "CLOSED", createdAt: new Date("2026-01-01T10:00:00Z") },
    ]);
  });

  it("exclut l'item courant de sa propre liste de rapprochement", async () => {
    prismaMock.appointmentRequest.findMany.mockResolvedValue([
      { id: "req-1", status: "CLOSED", createdAt: new Date() },
      { id: "req-current", status: "PENDING", createdAt: new Date() },
    ] as never);
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([]);

    const items = await listRelatedItems("journey-1", { kind: "request", id: "req-current" });

    expect(items.map((i) => i.id)).toEqual(["req-1"]);
  });

  it("ne porte jamais subject/message/notes", async () => {
    prismaMock.appointmentRequest.findMany.mockResolvedValue([]);
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([]);

    await listRelatedItems("journey-1", { kind: "followup", id: "f1" });

    const call = prismaMock.appointmentRequest.findMany.mock.calls[0][0];
    expect(Object.keys(call.select)).toEqual(["id", "status", "createdAt"]);
  });
});
