import type { Session } from "next-auth";
import { defaultDb, type DbClient } from "../availability/db";

/**
 * Équipes qui traitent une file de demandes (spec 063) : la fonction de département destinataire.
 */
export type QueueFunction = "SECRETARIAT" | "COMMUNICATION" | "PRODUCTION_MEDIA";

export interface RequestQueueAccess {
  /** Au moins un département de l'église porte la fonction. */
  readonly configured: boolean;
  /** L'appelant peut consulter et traiter la file. */
  readonly allowed: boolean;
  /** Gestion des événements de l'église : ouvre en plus la suppression d'une demande traitée. */
  readonly canManage: boolean;
}

/**
 * Accès à une file de traitement : `events:manage` dans l'église (ou Super Admin), ou membre d'un
 * département portant la fonction. Les permissions sont calculées sur l'église visée seulement
 * (spec 024, issue #490). Reprend à l'identique le contrôle des trois pages avant la spec 063.
 */
export async function resolveRequestQueueAccess(
  session: Session,
  churchId: string,
  fn: QueueFunction,
  db?: DbClient
): Promise<RequestQueueAccess> {
  // Import différé : `@/lib/registry` démarre les modules, dont celui-ci.
  const { rolePermissions } = await import("@/lib/registry");
  db ??= await defaultDb();

  const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const userPermissions = new Set(churchRoles.flatMap((r) => rolePermissions[r.role] ?? []));
  const canManage = session.user.isSuperAdmin || userPermissions.has("events:manage");

  const functionDepts = await db.department.findMany({
    where: { function: fn, ministry: { churchId } },
    select: { id: true },
  });
  if (functionDepts.length === 0) return { configured: false, allowed: canManage, canManage };

  const userDeptIds = new Set(churchRoles.flatMap((r) => r.departments.map((d) => d.department.id)));
  const isMember = functionDepts.some((d) => userDeptIds.has(d.id));
  return { configured: true, allowed: canManage || isMember, canManage };
}
