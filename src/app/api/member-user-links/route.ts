import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { resolveMemberDepartmentScope, isMemberInScope } from "@/lib/member-scope";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
import { admitToChurch } from "@/lib/admission";
import { createSchema, deleteSchema } from "./contract";

// Rattachement direct par un administrateur, cible désignée par `userId` (compte déjà connu de
// l'appelant, ex. sélectionné via /api/users/search) ou par `email` exact (spec 037 — le compte
// n'a alors aucun rôle ni demande dans cette église, seule une correspondance exacte cross-église
// peut le retrouver). L'un des deux est requis.
//
// Côté STAR : `memberId` (fiche existante) ou `newMember` (nouvelle fiche créée dans le même
// geste, spec 047 — pré-provisionnement d'un utilisateur avant sa première connexion). Exclusifs.

type MemberScope = Awaited<ReturnType<typeof resolveMemberDepartmentScope>>;

/**
 * La fiche visée doit être de l'église et dans le périmètre de l'appelant ; une nouvelle fiche,
 * dans un de ses départements. Une nouvelle fiche n'a par définition aucun lien existant.
 */
async function assertTargetInScope(
  memberId: string | undefined,
  newMember: { departmentId: string } | undefined,
  churchId: string,
  memberScope: MemberScope
) {
  if (memberId) {
    const member = await prisma.member.findFirst({
      where: { id: memberId, departments: { some: { department: { ministry: { churchId } } } } },
      include: { departments: { select: { departmentId: true } } },
    });
    if (!member) throw new ApiError(404, "STAR introuvable dans cette église");
    if (!isMemberInScope(memberScope, member.departments.map((d) => d.departmentId))) {
      throw new ApiError(403, "Ce STAR est hors de votre périmètre");
    }
  }
  if (newMember && memberScope.scoped && !memberScope.departmentIds.includes(newMember.departmentId)) {
    throw new ApiError(403, "Ce département est hors de votre périmètre");
  }
}

type TargetUser = { kind: "existing"; userId: string } | { kind: "create" } | { kind: "confirm" };

/**
 * Compte cible : par identifiant, ou par email. Un email inconnu demande confirmation
 * (`"confirm"`) avant la création d'un compte dormant (`"create"`).
 */
async function resolveTargetUser(
  inputUserId: string | undefined,
  email: string | undefined,
  confirmCreate: boolean | undefined
): Promise<TargetUser> {
  if (inputUserId) {
    const user = await prisma.user.findUnique({ where: { id: inputUserId } });
    if (!user) throw new ApiError(404, "Utilisateur introuvable");
    return { kind: "existing", userId: user.id };
  }
  const existing = await prisma.user.findUnique({ where: { email: email! } });
  if (existing) return { kind: "existing", userId: existing.id };
  return { kind: confirmCreate ? "create" : "confirm" };
}

/** Un seul lien par STAR et par compte dans une église. */
async function assertNotAlreadyLinked(memberId: string | undefined, userId: string, churchId: string) {
  if (memberId) {
    const existingByMember = await prisma.memberUserLink.findUnique({
      where: { memberId_churchId: { memberId, churchId } },
    });
    if (existingByMember) throw new ApiError(409, "Ce STAR est déjà lié à un compte dans cette église");
  }
  if (userId) {
    const existingByUser = await prisma.memberUserLink.findFirst({ where: { userId, churchId } });
    if (existingByUser) throw new ApiError(409, "Cet utilisateur est déjà lié à un STAR dans cette église");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { memberId, newMember, churchId, userId: inputUserId, email, confirmCreate } = createSchema.parse(body);
    // access:manage (Super Admin, Admin, Secrétaire, Ministre borné à son ministère) — remplace
    // members:manage, qui laissait tout Resp. département lier n'importe quelle fiche de
    // l'église (spec 054/#583, défaut B3 de audit-rbac.md)
    const session = await requireChurchPermission("access:manage", churchId);
    requireRateLimit(request, { prefix: `link:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });
    const memberScope = await resolveMemberDepartmentScope(session, churchId);

    await assertTargetInScope(memberId, newMember, churchId, memberScope);

    // Résoudre le compte cible. Aucune exigence de rattachement préalable à cette église : c'est
    // précisément la condition que ce rattachement crée (spec 037).
    const target = await resolveTargetUser(inputUserId, email, confirmCreate);
    if (target.kind === "confirm") return successResponse({ accountNotFound: true }, 409);
    // Compte inconnu et création confirmée : il est créé dans la transaction ci-dessous.
    let targetUserId = target.kind === "existing" ? target.userId : "";

    await assertNotAlreadyLinked(memberId, targetUserId, churchId);

    const link = await prisma.$transaction(async (tx) => {
      if (!targetUserId) {
        const created = await tx.user.create({ data: { email: email! } });
        targetUserId = created.id;
      }

      const { memberId: admittedMemberId } = await admitToChurch(tx, {
        userId: targetUserId,
        churchId,
        validatedById: session.user.id,
        memberId,
        newMember,
      });

      return tx.memberUserLink.findUniqueOrThrow({
        where: { memberId_churchId: { memberId: admittedMemberId!, churchId } },
      });
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "CREATE",
      entityType: "MemberUserLink",
      entityId: link.id,
      details: { memberId: link.memberId, userId: targetUserId },
    });

    return successResponse(link, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { memberId, churchId } = deleteSchema.parse(body);
    const session = await requireChurchPermission("access:manage", churchId);
    requireRateLimit(request, { prefix: `unlink:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });

    const link = await prisma.memberUserLink.findUnique({
      where: { memberId_churchId: { memberId, churchId } },
    });
    if (!link) throw new ApiError(404, "Ce STAR n'est lié à aucun compte dans cette église");

    const memberScope = await resolveMemberDepartmentScope(session, churchId);
    if (memberScope.scoped) {
      const member = await prisma.member.findUnique({
        where: { id: memberId },
        include: { departments: { select: { departmentId: true } } },
      });
      if (!member || !isMemberInScope(memberScope, member.departments.map((d) => d.departmentId))) {
        throw new ApiError(403, "Ce STAR est hors de votre périmètre");
      }
    }

    await prisma.memberUserLink.delete({ where: { id: link.id } });

    await logAudit({ userId: session.user.id, churchId, action: "DELETE", entityType: "MemberUserLink", entityId: link.id, details: { memberId, unlinkedUserId: link.userId } });

    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
