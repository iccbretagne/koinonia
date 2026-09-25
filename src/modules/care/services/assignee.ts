import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { DEPT_FN } from "@/lib/department-functions";
import { getFunctionDepartmentIds } from "@/lib/function-departments";

/**
 * Un accompagnant est soit un profil pastoral, soit un membre d'un département de fonction
 * MSDP (spec 052, lot 2) — les deux populations que `care` affecte désormais indifféremment
 * aux demandes de rendez-vous et aux suivis de nouveaux convertis.
 */
export type AssigneeSelection =
  | { kind: "PROFILE"; id: string }
  | { kind: "MEMBER"; id: string };

export interface ResolvedAssignee {
  kind: "PROFILE" | "MEMBER";
  /** Identifiant à stocker (`PastoralProfile.id` ou `User.id`). */
  id: string;
  /** Compte à notifier in-app — celui du membre, ou celui rattaché au profil (`null` si le
   *  profil pastoral n'a pas de compte : prévenu par email seulement). */
  userId: string | null;
  name: string | null;
  email: string | null;
}

/** Vérifie l'appartenance à l'église et renvoie les informations utiles à la notification. */
export async function resolveAssignee(
  churchId: string,
  selection: AssigneeSelection
): Promise<ResolvedAssignee> {
  if (selection.kind === "PROFILE") {
    const profile = await prisma.pastoralProfile.findFirst({
      where: { id: selection.id, churchId },
      select: { id: true, name: true, email: true, userId: true },
    });
    if (!profile) throw new ApiError(400, "Profil pastoral invalide ou hors périmètre");
    return { kind: "PROFILE", id: profile.id, userId: profile.userId, name: profile.name, email: profile.email };
  }

  const msdpDeptIds = await getFunctionDepartmentIds(churchId, DEPT_FN.MSDP);
  const membership = await prisma.userChurchRole.findFirst({
    where: {
      churchId,
      userId: selection.id,
      departments: { some: { departmentId: { in: msdpDeptIds } } },
    },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!membership) throw new ApiError(400, "Membre MSDP invalide ou hors périmètre");
  return {
    kind: "MEMBER",
    id: membership.user.id,
    userId: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
  };
}

/** Un accompagnant n'est jamais affecté aux deux populations à la fois. */
export function assertExclusiveAssignment(
  profileId: string | null | undefined,
  memberId: string | null | undefined
): void {
  if (profileId && memberId) {
    throw new ApiError(
      409,
      "État incohérent : affectation à la fois à un profil pastoral et à un membre du MSDP"
    );
  }
}

/**
 * Profils pastoraux assignables (T48, `GET /api/care/companions`) — `userId: null` signale
 * « pas de compte : prévenu par email seulement » (spec 052, sélecteur à deux groupes).
 */
export async function listAssignableProfiles(churchId: string) {
  return prisma.pastoralProfile.findMany({
    where: { churchId },
    select: { id: true, name: true, role: true, userId: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

/**
 * L'appelant est-il l'accompagnant actuellement en charge — le membre affecté directement, ou
 * le titulaire du compte rattaché au profil pastoral affecté (T38).
 */
export function isCurrentAssignee(
  currentUserId: string,
  assignee: { assignedMemberId: string | null | undefined; assignedProfileUserId: string | null | undefined }
): boolean {
  return assignee.assignedMemberId === currentUserId || assignee.assignedProfileUserId === currentUserId;
}
