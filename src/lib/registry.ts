import { boot } from "@/core/boot";
import { buildRolePermissions } from "@/core/permissions";
import { planningBus } from "@/modules/planning";
import { allManifests } from "./manifests";

/**
 * Registry singleton — chargé une fois au démarrage du process.
 *
 * Contient tous les modules activés selon ENABLED_MODULES (ou tous si absent).
 * Source de vérité pour les permissions dans les contrôles d'accès API.
 */
// L'ordre du tableau n'a pas de portée sémantique (le vrai ordre de chargement est
// résolu par tri topologique dans boot()).
export const registry = boot({
  modules: [...allManifests],
});

/**
 * Matrice rôles → permissions pré-calculée depuis les manifestes.
 * Seule source de vérité des permissions dans les guards API (l'ancien helper
 * src/lib/permissions.ts a été supprimé).
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
 *
 * **Jamais conditionné par `registry.has("discipleship")`** — contrairement à
 * l'abonnement media ci-dessous. Ces lignes existent en base indépendamment du
 * réglage de déploiement (spec 038) : les conditionner ferait échouer la suppression
 * d'un événement sur une contrainte FK dès qu'une instance désactive discipleship,
 * alors que la donnée qu'il nettoie peut très bien exister (module réactivé plus
 * tard, ou données historiques). C'est l'unique exception nommée par la spec :
 * « nettoyer oui, créer non ».
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
 *
 * **Conditionné par `registry.has("media")`** (spec 038) : à l'inverse de l'abonnement
 * discipleship ci-dessus, celui-ci **crée** une donnée appartenant à un module — sur
 * une instance sans media, on ne fabrique pas de `MediaProject` orphelin de tout accès
 * applicatif. « nettoyer oui, créer non ».
 */
planningBus.on(
  "planning:request:status_changed",
  async ({ tx, userId }, { requestType, newStatus, churchId, requestId, title, payload }) => {
    if (!registry.has("media")) return;
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
