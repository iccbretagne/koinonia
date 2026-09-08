import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
// next-auth requires Next.js server modules unavailable in Vitest
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
  requirePermission: vi.fn(),
}));

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

/**
 * Spec 038 — « nettoyer oui, créer non » : les deux abonnements de registry.ts n'ont pas
 * la même relation au réglage de déploiement. Vérifié ici séparément d'ENABLED_MODULES
 * (via la variable d'environnement, comme le lirait un vrai process) pour ne pas dépendre
 * de l'ordre des autres suites qui, elles, bootent avec tous les modules actifs.
 */
describe("registry — abonnements et ENABLED_MODULES (spec 038)", () => {
  const originalEnabledModules = process.env.ENABLED_MODULES;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnabledModules === undefined) delete process.env.ENABLED_MODULES;
    else process.env.ENABLED_MODULES = originalEnabledModules;
  });

  async function emitStatusChanged() {
    vi.resetModules();
    const { planningBus } = await import("@/modules/planning");
    await import("@/lib/registry");
    const fakeTx = prismaMock as unknown as Parameters<typeof planningBus.emit>[1]["tx"];
    await planningBus.emit(
      "planning:request:status_changed",
      { tx: fakeTx, churchId: "church-1", userId: "user-1" },
      {
        requestId: "req-1",
        requestType: "VISUEL",
        churchId: "church-1",
        oldStatus: "SOUMISE",
        newStatus: "EN_COURS",
        updatedById: "user-1",
        title: "Affiche culte",
        payload: { brief: "Un beau visuel" },
      }
    );
  }

  it("crée un MediaProject quand media est actif (comportement par défaut, tous modules actifs)", async () => {
    delete process.env.ENABLED_MODULES;
    prismaMock.mediaProject.create.mockResolvedValue({} as never);

    await emitStatusChanged();

    expect(prismaMock.mediaProject.create).toHaveBeenCalledOnce();
  });

  it("ne crée PAS de MediaProject quand media est désactivé (registry.has(\"media\") === false)", async () => {
    process.env.ENABLED_MODULES = "core,planning";

    await emitStatusChanged();

    expect(prismaMock.mediaProject.create).not.toHaveBeenCalled();
  });

  it("continue de supprimer les DiscipleshipAttendance même quand discipleship est désactivé (exception nommée)", async () => {
    process.env.ENABLED_MODULES = "core,planning";
    prismaMock.discipleshipAttendance.deleteMany.mockResolvedValue({ count: 1 });

    vi.resetModules();
    const { planningBus } = await import("@/modules/planning");
    await import("@/lib/registry");
    const fakeTx = prismaMock as unknown as Parameters<typeof planningBus.emit>[1]["tx"];

    await planningBus.emit(
      "planning:event:cancelled",
      { tx: fakeTx, churchId: "church-1", userId: "user-1" },
      { eventId: "evt-1", churchId: "church-1", cancelledById: "user-1" }
    );

    expect(prismaMock.discipleshipAttendance.deleteMany).toHaveBeenCalledOnce();
  });
});
