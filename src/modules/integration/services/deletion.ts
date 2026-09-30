import { ApiError } from "@/lib/api-utils";
import { deleteItemNotifications } from "@/lib/notifications";
import type { Prisma } from "@/generated/prisma/client";

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
  await deleteItemNotifications(tx, "FamilyIntegrationRequest", id, [
    `/integration/requests/${id}`,
    `/admin/integration/requests/${id}`,
  ]);
  const { count } = await tx.familyIntegrationRequest.deleteMany({ where: { id, churchId } });
  if (count === 0) throw new ApiError(404, "Demande introuvable");
}
