import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { createOption, updateOption } = await import("../services/events");

const base = { label: "Repas enfant", type: "CHECKBOX" as const, scope: "PARTICIPANT" as const, price: 5 };
const existing = { id: "child", eventId: "ev-1", label: "Repas enfant", type: "CHECKBOX", scope: "PARTICIPANT", choiceGroup: null, event: { id: "ev-1", churchId: "church-1" } };

describe("groupes d'options au choix unique (spec 074)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.ticketingEvent.findUniqueOrThrow.mockResolvedValue({ churchId: "church-1" });
    prismaMock.ticketingOption.count.mockResolvedValue(1);
    prismaMock.ticketingOption.create.mockResolvedValue({ id: "child", label: "Repas enfant" });
    prismaMock.ticketingOption.update.mockResolvedValue({ id: "child" });
    prismaMock.ticketingOption.findUnique.mockResolvedValue(existing);
    prismaMock.ticketingItem.findMany.mockResolvedValue([]);
  });

  it("crée une option dans un groupe de même portée", async () => {
    prismaMock.ticketingOption.findMany.mockResolvedValue([{ id: "adult", scope: "PARTICIPANT" }]);
    await createOption("ev-1", "org-1", { ...base, choiceGroup: "Repas" });
    expect(prismaMock.ticketingOption.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ choiceGroup: "Repas" }) }));
  });

  it("refuse un groupe qui mélangerait participant et réservation", async () => {
    prismaMock.ticketingOption.findMany.mockResolvedValue([{ id: "family", scope: "BOOKING" }]);
    await expect(createOption("ev-1", "org-1", { ...base, choiceGroup: "Repas" })).rejects.toThrow(/toutes par participant/);
    expect(prismaMock.ticketingOption.create).not.toHaveBeenCalled();
  });

  it("refuse de grouper des options déjà cumulées par un inscrit", async () => {
    prismaMock.ticketingOption.findMany.mockResolvedValue([{ id: "adult", scope: "PARTICIPANT" }]);
    prismaMock.ticketingItem.findMany.mockResolvedValue([
      { bookingId: "bk-1", participantId: "p1", optionId: "adult" },
      { bookingId: "bk-1", participantId: "p1", optionId: "child" },
    ]);
    await expect(updateOption("ev-1", "child", "org-1", { choiceGroup: "Repas" })).rejects.toThrow(/déjà plusieurs options/);
    expect(prismaMock.ticketingOption.update).not.toHaveBeenCalled();
  });

  it("accepte quand chaque inscrit n'a qu'une option du groupe", async () => {
    prismaMock.ticketingOption.findMany.mockResolvedValue([{ id: "adult", scope: "PARTICIPANT" }]);
    prismaMock.ticketingItem.findMany.mockResolvedValue([
      { bookingId: "bk-1", participantId: "p1", optionId: "adult" },
      { bookingId: "bk-1", participantId: "p2", optionId: "child" },
    ]);
    await updateOption("ev-1", "child", "org-1", { choiceGroup: "Repas" });
    expect(prismaMock.ticketingOption.update).toHaveBeenCalled();
  });

  it("sortir une option de son groupe ne vérifie rien", async () => {
    await updateOption("ev-1", "child", "org-1", { choiceGroup: null });
    expect(prismaMock.ticketingOption.findMany).not.toHaveBeenCalled();
  });
});
