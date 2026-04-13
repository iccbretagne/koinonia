import { boot } from "@/core/boot";
import { buildRolePermissions } from "@/core/permissions";
import { coreModule } from "@/modules/core";
import { planningModule } from "@/modules/planning";
import { discipleshipModule } from "@/modules/discipleship";

/**
 * Registry singleton — chargé une fois au démarrage du process.
 *
 * Contient tous les modules activés selon ENABLED_MODULES (ou tous si absent).
 * Source de vérité pour les permissions dans les contrôles d'accès API.
 */
export const registry = boot({
  modules: [coreModule, planningModule, discipleshipModule],
});

/**
 * Matrice rôles → permissions pré-calculée depuis les manifestes.
 * Remplace ROLE_PERMISSIONS de src/lib/permissions.ts dans les guards API.
 */
export const rolePermissions = buildRolePermissions(registry);
