import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
import { admitToChurch } from "@/lib/admission";
import { z } from "zod";

// Rattachement direct par un administrateur, cible désignée par `userId` (compte déjà connu de
// l'appelant, ex. sélectionné via /api/users/search) ou par `email` exact (spec 037 — le compte
// n'a alors aucun rôle ni demande dans cette église, seule une correspondance exacte cross-église
// peut le retrouver). L'un des deux est requis.
const createSchema = z
  .object({
    memberId: z.string(),
    churchId: z.string(),
    userId: z.string().optional(),
    email: z.string().trim().email().optional(),
    // Double confirmation exigée avant de créer un compte dormant pour une adresse inconnue —
    // une erreur de frappe ne doit pas rattacher silencieusement un STAR à une adresse fantôme.
    confirmCreate: z.boolean().optional(),
  })
  .refine((d) => d.userId ?? d.email, { message: "userId ou email requis" });

const deleteSchema = z.object({
  memberId: z.string(),
  churchId: z.string(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { memberId, churchId, userId: inputUserId, email, confirmCreate } = createSchema.parse(body);
    const session = await requireChurchPermission("members:manage", churchId);
    requireRateLimit(request, { prefix: `link:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });

    // Vérifier que le member appartient bien à l'église concernée
    const member = await prisma.member.findFirst({
      where: { id: memberId, departments: { some: { department: { ministry: { churchId } } } } },
    });
    if (!member) throw new ApiError(404, "STAR introuvable dans cette église");

    // Résoudre le compte cible. Aucune exigence de rattachement préalable à cette église : c'est
    // précisément la condition que ce rattachement crée (spec 037).
    let targetUserId = "";
    if (inputUserId) {
      const user = await prisma.user.findUnique({ where: { id: inputUserId } });
      if (!user) throw new ApiError(404, "Utilisateur introuvable");
      targetUserId = user.id;
    } else {
      const existing = await prisma.user.findUnique({ where: { email: email! } });
      if (existing) {
        targetUserId = existing.id;
      } else if (!confirmCreate) {
        return successResponse({ accountNotFound: true }, 409);
      }
      // targetUserId reste vide : le compte est créé dans la transaction ci-dessous.
    }

    // Vérifier qu'il n'y a pas déjà un lien pour ce membre dans cette église
    const existingByMember = await prisma.memberUserLink.findUnique({
      where: { memberId_churchId: { memberId, churchId } },
    });
    if (existingByMember) throw new ApiError(409, "Ce STAR est déjà lié à un compte dans cette église");

    if (targetUserId) {
      const existingByUser = await prisma.memberUserLink.findFirst({
        where: { userId: targetUserId, churchId },
      });
      if (existingByUser) throw new ApiError(409, "Cet utilisateur est déjà lié à un STAR dans cette église");
    }

    const link = await prisma.$transaction(async (tx) => {
      if (!targetUserId) {
        const created = await tx.user.create({ data: { email: email! } });
        targetUserId = created.id;
      }

      await admitToChurch(tx, {
        userId: targetUserId,
        churchId,
        validatedById: session.user.id,
        memberId,
      });

      return tx.memberUserLink.findUniqueOrThrow({
        where: { memberId_churchId: { memberId, churchId } },
      });
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "CREATE",
      entityType: "MemberUserLink",
      entityId: link.id,
      details: { memberId, userId: targetUserId },
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
    const session = await requireChurchPermission("members:manage", churchId);
    requireRateLimit(request, { prefix: `unlink:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });

    const link = await prisma.memberUserLink.findUnique({
      where: { memberId_churchId: { memberId, churchId } },
    });
    if (!link) throw new ApiError(404, "Ce STAR n'est lié à aucun compte dans cette église");

    await prisma.memberUserLink.delete({ where: { id: link.id } });

    await logAudit({ userId: session.user.id, churchId, action: "DELETE", entityType: "MemberUserLink", entityId: link.id, details: { memberId, unlinkedUserId: link.userId } });

    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
