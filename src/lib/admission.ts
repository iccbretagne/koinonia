import type { Prisma, Role } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";

type TxClient = Prisma.TransactionClient;

// Le champ `requestedRole` de `MemberLinkRequest` est un `String?` non typé côté schéma
// (commentaire de colonne, pas d'enum Prisma) — on reflète la même largeur ici plutôt que
// de forcer un type que la source de la donnée ne garantit pas.
type RequestedRole = string | null;

export interface AdmitToChurchInput {
  userId: string;
  churchId: string;
  validatedById: string;
  /** Fiche STAR existante à lier. Absent si `newMember` est fourni (nouvelle fiche). */
  memberId?: string | null;
  /** Nouvelle fiche STAR à créer — mutuellement exclusif avec `memberId`. */
  newMember?: {
    firstName: string;
    lastName: string;
    phone?: string | null;
    departmentId: string;
  };
  requestedRole?: RequestedRole;
  departmentId?: string | null;
  ministryId?: string | null;
}

export interface AdmitToChurchResult {
  memberId: string | null;
  /** Rôle STAR attribué automatiquement, faute de tout autre rôle dans l'église. */
  starRoleAssigned: boolean;
}

/**
 * Admission complète d'une personne dans une église : lier n'accorde jamais d'accès à lui
 * seul (spec 037) — cette fonction crée le lien STAR↔compte ET s'assure que la personne
 * dispose d'un rôle dans l'église, avec le rôle STAR comme accès de base par défaut.
 *
 * Extraite de la transaction d'approbation d'une demande de liaison
 * (`PATCH /api/member-link-requests/[id]`), qui reste son premier appelant sans changement de
 * comportement. `POST /api/member-user-links` (rattachement direct par un administrateur) y
 * délègue également.
 *
 * Doit être appelée à l'intérieur d'une transaction Prisma ouverte par l'appelant — l'audit et
 * les notifications, qui diffèrent selon le chemin, restent à sa charge.
 */
export async function admitToChurch(
  tx: TxClient,
  input: AdmitToChurchInput
): Promise<AdmitToChurchResult> {
  const { userId, churchId, validatedById, requestedRole = null } = input;
  const isNoStarRole = requestedRole === "DISCIPLE_MAKER" || requestedRole === "REPORTER";

  let memberId = input.memberId ?? null;
  let memberName: MemberName | null = null;

  // ── Créer la fiche STAR si nouvelle ──────────────────────────────────────────
  if (input.newMember) {
    const created = await createMemberInChurch(tx, churchId, input.newMember);
    memberId = created.id;
    memberName = { firstName: created.firstName, lastName: created.lastName };
  }

  // ── Créer le lien STAR↔compte (sauf rôle sans STAR) ──────────────────────────
  if (!isNoStarRole && memberId) {
    await tx.memberUserLink.create({
      data: { memberId, userId, churchId, validatedAt: new Date(), validatedById },
    });
  }

  if (memberId) await fillDisplayName(tx, userId, memberId, memberName);

  // ── Créer le rôle demandé ─────────────────────────────────────────────────────
  if (requestedRole) await grantRequestedRole(tx, input, requestedRole);

  // ── Accès de base : rôle STAR si la personne n'a encore aucun rôle ───────────
  let starRoleAssigned = false;
  if (!isNoStarRole && memberId) {
    const hasAnyRole = await tx.userChurchRole.findFirst({ where: { userId, churchId } });
    if (!hasAnyRole) {
      await tx.userChurchRole.create({ data: { userId, churchId, role: "STAR" } });
      starRoleAssigned = true;
    }
  }

  return { memberId, starRoleAssigned };
}

type MemberName = { firstName: string; lastName: string };
type ExistingRole = { id: string } | null;

async function assertDepartmentInChurch(tx: TxClient, departmentId: string, churchId: string) {
  const dept = await tx.department.findUnique({
    where: { id: departmentId },
    include: { ministry: { select: { churchId: true } } },
  });
  if (dept?.ministry.churchId !== churchId) {
    throw new ApiError(400, "Ce département n'appartient pas à cette église");
  }
}

async function createMemberInChurch(
  tx: TxClient,
  churchId: string,
  newMember: NonNullable<AdmitToChurchInput["newMember"]>
) {
  await assertDepartmentInChurch(tx, newMember.departmentId, churchId);
  return tx.member.create({
    data: {
      firstName: newMember.firstName,
      lastName: newMember.lastName,
      phone: newMember.phone ?? undefined,
      departments: { create: { departmentId: newMember.departmentId, isPrimary: true } },
    },
  });
}

/**
 * displayName : ne jamais écraser une valeur déjà renseignée. Un rattachement dans une seconde
 * église ne doit pas effacer le nom défini par la première (limitation connue,
 * docs/security-exceptions.md) — cette feature rend le cas courant.
 */
async function fillDisplayName(tx: TxClient, userId: string, memberId: string, knownName: MemberName | null) {
  // Fiche existante (pas de création) : le nom n'est connu que par une requête dédiée.
  const memberName =
    knownName ??
    (await tx.member.findUnique({ where: { id: memberId }, select: { firstName: true, lastName: true } }));
  if (!memberName) return;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  if (!user?.displayName) {
    await tx.user.update({
      where: { id: userId },
      data: { displayName: `${memberName.firstName} ${memberName.lastName}` },
    });
  }
}

async function grantRequestedRole(tx: TxClient, input: AdmitToChurchInput, requestedRole: string) {
  const { userId, churchId } = input;
  const prismaRole = (requestedRole === "DEPUTY" ? "DEPARTMENT_HEAD" : requestedRole) as Role;
  const existingRole = await tx.userChurchRole.findFirst({
    where: { userId, churchId, role: prismaRole },
  });

  if (requestedRole === "MINISTER") {
    await grantMinister(tx, input, existingRole);
  } else if (requestedRole === "DEPARTMENT_HEAD" || requestedRole === "DEPUTY") {
    await grantDepartmentHead(tx, input, existingRole, requestedRole === "DEPUTY");
  } else if ((requestedRole === "DISCIPLE_MAKER" || requestedRole === "REPORTER") && !existingRole) {
    await tx.userChurchRole.create({ data: { userId, churchId, role: prismaRole } });
  }
}

async function grantMinister(tx: TxClient, input: AdmitToChurchInput, existingRole: ExistingRole) {
  const { userId, churchId, ministryId } = input;
  if (!ministryId) throw new ApiError(400, "Le ministère est requis pour le rôle Ministre");
  const ministry = await tx.ministry.findUnique({ where: { id: ministryId }, select: { churchId: true } });
  if (ministry?.churchId !== churchId) {
    throw new ApiError(400, "Ce ministère n'appartient pas à cette église");
  }
  if (existingRole) {
    await tx.userChurchRole.update({ where: { id: existingRole.id }, data: { ministryId } });
  } else {
    await tx.userChurchRole.create({ data: { userId, churchId, role: "MINISTER", ministryId } });
  }
}

async function grantDepartmentHead(
  tx: TxClient,
  input: AdmitToChurchInput,
  existingRole: ExistingRole,
  isDeputy: boolean
) {
  const { userId, churchId, departmentId } = input;
  if (!departmentId) throw new ApiError(400, "Le département est requis pour ce rôle");
  // Le contrôle d'appartenance est déjà fait pour une nouvelle fiche (`newMember`) ; ici on le
  // refait pour couvrir le cas d'une fiche STAR existante.
  if (!input.newMember) await assertDepartmentInChurch(tx, departmentId, churchId);
  if (existingRole) {
    await tx.userDepartment.create({
      data: { userChurchRoleId: existingRole.id, departmentId, isDeputy },
    });
  } else {
    await tx.userChurchRole.create({
      data: { userId, churchId, role: "DEPARTMENT_HEAD", departments: { create: { departmentId, isDeputy } } },
    });
  }
}
