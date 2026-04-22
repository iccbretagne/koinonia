import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

/**
 * Vérifie les abonnements cross-module enregistrés dans src/lib/registry.ts.
 *
 * On importe le registry APRÈS le mock prisma pour que les handlers
 * s'enregistrent sur planningBus avec le tx mock.
 */
describe("registry — abonnements cross-module", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Réinitialiser le bus entre les tests pour isoler les handlers
    const { planningBus } = await import("@/modules/planning");
    planningBus.clear();
    // Ré-importer le registry pour re-enregistrer les handlers
    vi.resetModules();
  });

  it("planning:event:cancelled supprime les DiscipleshipAttendance liées", async () => {
    // Réinitialiser les modules pour obtenir un bus propre avec handlers fraîchement enregistrés
    vi.resetModules();
    const { planningBus } = await import("@/modules/planning");
    // Charger le registry pour enregistrer les handlers
    await import("@/lib/registry");

    prismaMock.discipleshipAttendance.deleteMany.mockResolvedValue({ count: 2 });

    const fakeTx = prismaMock as unknown as Parameters<typeof planningBus.emit>[1]["tx"];

    await planningBus.emit(
      "planning:event:cancelled",
      { tx: fakeTx, churchId: "church-1", userId: "user-1" },
      { eventId: "evt-1", churchId: "church-1", cancelledById: "user-1" }
    );

    expect(prismaMock.discipleshipAttendance.deleteMany).toHaveBeenCalledOnce();
    expect(prismaMock.discipleshipAttendance.deleteMany).toHaveBeenCalledWith({
      where: { eventId: "evt-1" },
    });
  });

  it("planning:event:created ne déclenche pas de suppression d'attendance", async () => {
    vi.resetModules();
    const { planningBus } = await import("@/modules/planning");
    await import("@/lib/registry");

    const fakeTx = prismaMock as unknown as Parameters<typeof planningBus.emit>[1]["tx"];

    await planningBus.emit(
      "planning:event:created",
      { tx: fakeTx, churchId: "church-1", userId: "user-1" },
      {
        eventId: "evt-1",
        churchId: "church-1",
        title: "Culte",
        type: "CULTE",
        createdById: "user-1",
        isRecurrenceParent: false,
      }
    );

    expect(prismaMock.discipleshipAttendance.deleteMany).not.toHaveBeenCalled();
  });
});
