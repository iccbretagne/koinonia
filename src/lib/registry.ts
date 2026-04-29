import { boot } from "@/core/boot";
import { buildRolePermissions } from "@/core/permissions";
import { coreModule } from "@/modules/core";
import { planningModule, planningBus } from "@/modules/planning";
import { discipleshipModule } from "@/modules/discipleship";
import { mediaModule } from "@/modules/media";
import { mrbsModule } from "@/modules/mrbs";

/**
 * Registry singleton — chargé une fois au démarrage du process.
 *
 * Contient tous les modules activés selon ENABLED_MODULES (ou tous si absent).
 * Source de vérité pour les permissions dans les contrôles d'accès API.
 */
export const registry = boot({
  modules: [coreModule, planningModule, discipleshipModule, mediaModule, mrbsModule],
});

/**
 * Matrice rôles → permissions pré-calculée depuis les manifestes.
 * Remplace ROLE_PERMISSIONS de src/lib/permissions.ts dans les guards API.
 */
export const rolePermissions = buildRolePermissions(registry);

// ─── Abonnements cross-module ─────────────────────────────────────────────────
//
// Le registry est la racine de composition : seul endroit où tous les modules
// sont visibles. Les abonnements ici permettent à un module de réagir aux
// événements d'un autre sans importer directement depuis ce module.

/**
 * Discipleship → Planning : quand un événement est annulé, supprimer les
 * enregistrements de présence discipleship liés (évite une FK violation et
 * maintient la cohérence des données de suivi).
 *
 * S'exécute dans la même transaction que la suppression de l'événement.
 */
planningBus.on("planning:event:cancelled", async ({ tx }, { eventId }) => {
  await tx.discipleshipAttendance.deleteMany({ where: { eventId } });
});

/**
 * Media → Planning : quand une Request VISUEL passe en EN_COURS (prise en charge
 * par la Production Média), créer automatiquement un MediaProject correspondant.
 *
 * - Le nom du projet reprend le titre de la Request.
 * - La description embarque le brief et l'identifiant de la Request (référence loose,
 *   pas de FK Prisma cross-module — conforme aux règles d'architecture v1.0).
 *
 * S'exécute dans la même transaction que la mise à jour du statut.
 */
planningBus.on(
  "planning:request:status_changed",
  async ({ tx, userId }, { requestType, newStatus, churchId, requestId, title, payload }) => {
    if (requestType !== "VISUEL" || newStatus !== "EN_COURS") return;

    const brief = typeof payload.brief === "string" ? payload.brief : null;
    const description = [
      brief,
      `[source:request:${requestId}]`,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!userId) return; // ne devrait pas arriver depuis une route API authentifiée

    await tx.mediaProject.create({
      data: {
        name: title,
        description,
        churchId,
        createdById: userId,
      },
    });
  }
);
