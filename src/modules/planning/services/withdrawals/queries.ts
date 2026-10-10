import type { ServiceStatus, ServiceWithdrawalStatus } from "@/generated/prisma/client";
import { defaultDb, type DbClient } from "../availability/db";
import { listReplacementCandidates, type ReplacementCandidate } from "./candidates";
import { replaceable } from "./rules";

/** Lectures des désistements (spec 061) : grille, « Mon planning » et écran du service à remplacer. */

export interface PendingSlotWithdrawal {
  id: string;
  memberId: string;
  memberName: string;
  message: string | null;
  originalStatus: ServiceStatus;
  createdAt: Date;
}

/** Département et fiche d'un désistement, pour les gardes de périmètre des routes. `null` s'il n'existe pas. */
export async function getWithdrawalOwner(
  id: string,
  db?: DbClient
): Promise<{ departmentId: string; memberId: string } | null> {
  db ??= await defaultDb();
  return db.serviceWithdrawal.findUnique({ where: { id }, select: { departmentId: true, memberId: true } });
}

/** Désistements en attente d'un service (événement × département), du plus ancien au plus récent. */
export async function listPendingWithdrawalsForSlot(
  eventId: string,
  departmentId: string,
  db?: DbClient
): Promise<PendingSlotWithdrawal[]> {
  db ??= await defaultDb();
  const rows = await db.serviceWithdrawal.findMany({
    where: { eventId, departmentId, status: "PENDING" },
    select: {
      id: true,
      memberId: true,
      message: true,
      originalStatus: true,
      createdAt: true,
      member: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(({ member, ...w }) => ({ ...w, memberName: `${member.firstName} ${member.lastName}` }));
}

export interface PendingMemberWithdrawal {
  id: string;
  memberId: string;
  eventId: string;
  departmentId: string;
  originalStatus: ServiceStatus;
}

/** Désistements en attente des fiches STAR d'un compte, pour « Mon planning ». */
export async function listPendingWithdrawalsForMembers(memberIds: string[], db?: DbClient): Promise<PendingMemberWithdrawal[]> {
  if (memberIds.length === 0) return [];
  db ??= await defaultDb();
  return db.serviceWithdrawal.findMany({
    where: { memberId: { in: memberIds }, status: "PENDING" },
    select: { id: true, memberId: true, eventId: true, departmentId: true, originalStatus: true },
  });
}

export interface WithdrawalDetail {
  withdrawal: {
    id: string;
    status: ServiceWithdrawalStatus;
    message: string | null;
    originalStatus: ServiceStatus;
    createdAt: Date;
    replacementName: string | null;
  };
  event: { id: string; title: string; date: Date };
  department: { id: string; name: string };
  member: { id: string; firstName: string; lastName: string };
  candidates: ReplacementCandidate[];
  /** Le service est encore à remplacer : en attente et avant le début de l'événement. */
  open: boolean;
  /** Le lecteur peut choisir un remplaçant maintenant (droit d'édition, en attente, avant le début). */
  canReplace: boolean;
}

/**
 * Écran du service à remplacer. Les candidats sont recalculés à chaque lecture, et seulement tant
 * que le service est à remplacer. `viewerCanEdit` vient de la garde de la route (`planning:edit`).
 */
export async function getWithdrawalDetail(
  id: string,
  { viewerCanEdit }: { viewerCanEdit: boolean },
  db?: DbClient,
  now: Date = new Date()
): Promise<WithdrawalDetail | null> {
  db ??= await defaultDb();
  const w = await db.serviceWithdrawal.findUnique({
    where: { id },
    select: {
      id: true,
      churchId: true,
      departmentId: true,
      memberId: true,
      status: true,
      message: true,
      originalStatus: true,
      createdAt: true,
      event: { select: { id: true, title: true, date: true } },
      department: { select: { id: true, name: true } },
      member: { select: { id: true, firstName: true, lastName: true } },
      replacementMember: { select: { firstName: true, lastName: true } },
    },
  });
  if (!w) return null;

  const open = w.status === "PENDING" && replaceable(w.event, now);
  const candidates = open ? await listReplacementCandidates(w, db, now) : [];
  return {
    withdrawal: {
      id: w.id,
      status: w.status,
      message: w.message,
      originalStatus: w.originalStatus,
      createdAt: w.createdAt,
      replacementName: w.replacementMember ? `${w.replacementMember.firstName} ${w.replacementMember.lastName}` : null,
    },
    event: w.event,
    department: w.department,
    member: w.member,
    candidates,
    open,
    canReplace: open && viewerCanEdit,
  };
}
