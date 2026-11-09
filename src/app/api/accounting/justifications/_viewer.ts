import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api-utils";
import { rolePermissions } from "@/lib/registry";
import { getAccountingDepartmentScope, type JustificationViewer } from "@/modules/accounting";

/**
 * Lecteur des justificatifs dans l'église courante (spec 078) : la compta voit tout, les autres
 * voient leurs demandes et celles de leur périmètre comptable. Aucune permission nouvelle.
 */
export async function requireJustificationViewer(): Promise<JustificationViewer> {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
  const perms = session.user.churchRoles.filter((r) => r.churchId === churchId).flatMap((r) => rolePermissions[r.role] ?? []);
  if (!["accounting:view", "accounting:submit", "accounting:manage"].some((p) => perms.includes(p))) {
    throw new ApiError(403, "Accès refusé");
  }
  return {
    userId: session.user.id!,
    churchId,
    manage: perms.includes("accounting:manage"),
    scope: await getAccountingDepartmentScope(session, churchId),
  };
}
