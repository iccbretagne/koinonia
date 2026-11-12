import type { Session } from "next-auth";
import type { z } from "zod";
import { getUserDepartmentScope } from "@/lib/auth";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import {
  declareAbsence,
  getMemberScope,
  isMemberLinkedToUser,
  resolveSubjectUserId,
  validateBackupTargets,
  type DeclarerScope,
} from "@/modules/planning";
import type { backupSchema, createSchema } from "./contract";

/** Vérifie une permission dans l'église de l'absence ; jette `FORBIDDEN` sinon (écran ou assistant). */
export type RequirePermission = (permission: string) => Promise<Session>;

/**
 * Vérifie qu'une déclaration/modification avec backups est autorisée, et avec quel périmètre.
 *
 * Le périmètre de backup est toujours celui de la **personne absente** (`memberId`) — en
 * auto-déclaration (`isSelf`), c'est le déclarant lui-même ; pour un tiers, c'est le compte lié
 * à ce STAR (s'il existe et a un rôle Resp. département/Ministre — sinon aucun backup n'est
 * disponible, cf. spec 014). Ne fait rien si `backups` est vide/absent.
 */
export async function assertBackupsAllowed(
  backups: z.infer<typeof backupSchema>[] | undefined,
  isSelf: boolean,
  declarerUserId: string,
  memberId: string,
  churchId: string
) {
  if (!backups || backups.length === 0) return;

  const subjectUserId = isSelf ? declarerUserId : await resolveSubjectUserId(memberId, churchId);
  if (!subjectUserId) {
    throw new ApiError(403, "Backup indisponible : cette fiche n'a pas de compte lié avec un rôle responsable");
  }
  await validateBackupTargets(subjectUserId, churchId, backups);
}

/**
 * Déclare une absence, pour soi ou pour un STAR de son périmètre (même code pour l'écran et
 * l'assistant IA — spec 081, lot 3b). Auto-déclaration : aucune permission ; pour un tiers :
 * `absences:manage` et STAR dans le périmètre départemental du déclarant.
 */
export async function declareAbsenceFor(
  session: Session,
  data: z.infer<typeof createSchema>,
  requirePermission: RequirePermission,
  details: Record<string, unknown> = {}
) {
  const { churchId, memberId } = data;
    const memberScope = await getMemberScope(memberId);
  if (!memberScope) throw new ApiError(404, "Fiche STAR introuvable");
  if (memberScope.churchId && memberScope.churchId !== churchId) {
    throw new ApiError(403, "Cette fiche n'appartient pas à cette église");
  }

  const isSelf = await isMemberLinkedToUser(memberId, session.user.id, churchId);

  // Périmètre du déclarant appliqué au ciblage départemental (spec 050) : seul pertinent quand
  // un tiers déclare pour un STAR — l'auto-déclaration reste bornée par les propres
  // départements du STAR, déjà vérifiés par `validateTargeting`.
  let declarerScope: DeclarerScope = { scoped: false, departmentIds: [] };

  if (!isSelf) {
    const managerSession = await requirePermission("absences:manage");
    const deptScope = getUserDepartmentScope(managerSession, churchId);
    if (deptScope.scoped) {
      const withinScope = memberScope.departmentIds.some((id) => deptScope.departmentIds.includes(id));
      if (!withinScope) throw new ApiError(403, "Ce STAR n'appartient pas à votre périmètre");
      declarerScope = deptScope;
    }
  }

  await assertBackupsAllowed(data.backups, isSelf, session.user.id, memberId, churchId);

  const absence = await declareAbsence({
    churchId,
    memberId,
    kind: data.kind,
    startDate: data.startDate ? new Date(data.startDate) : undefined,
    endDate: data.endDate ? new Date(data.endDate) : undefined,
    eventIds: data.eventIds,
    allDepartments: data.allDepartments,
    departmentIds: data.departmentIds,
    reason: data.reason,
    createdById: session.user.id,
    backups: data.backups,
    declarerScope,
  });

  await logAudit({
    userId: session.user.id,
    churchId,
    action: "CREATE",
    entityType: "Absence",
    entityId: absence.id,
    details: { memberId, kind: data.kind, startDate: data.startDate, endDate: data.endDate, allDepartments: data.allDepartments, ...details },
  });

  return absence;
}
