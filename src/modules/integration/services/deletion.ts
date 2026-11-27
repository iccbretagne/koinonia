import { ApiError } from "@/lib/api-utils";
import { deleteItemNotifications } from "@/lib/notifications";
import type { Prisma } from "@/generated/prisma/client";
import { paths } from "@/lib/paths";

/**
 * Suppression définitive d'une demande d'intégration (spec 057, ADR-0019) : historique,
 * notifications, puis la demande. S'exécute dans la transaction de l'appelant, qui vérifie
 * d'abord l'absence d'élément `care` issu de la demande (module distinct, ADR-0001) et écrit la
 * ligne de journal `DELETE` une fois la transaction validée.
 */
export async function deleteIntegrationRequest(
  tx: Prisma.TransactionClient,
  { id, churchId }: { id: string; churchId: string }
): Promise<void> {
  await tx.auditLog.deleteMany({ where: { entityType: "FamilyIntegrationRequest", entityId: id } });
  // Les anciennes formes du lien (dont `/admin/integration/requests/<id>`, #629) sont ajoutées
  // par `deleteItemNotifications` depuis `legacy-paths.ts` (spec 092, lot 4).
  await deleteItemNotifications(tx, "FamilyIntegrationRequest", id, [paths.integration.request(id)]);
  const { count } = await tx.familyIntegrationRequest.deleteMany({ where: { id, churchId } });
  if (count === 0) throw new ApiError(404, "Demande introuvable");
}
