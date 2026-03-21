import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
import { z } from "zod";

const schema = z.object({
  memberId: z.string(),
  userId: z.string(),
  churchId: z.string(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { memberId, userId, churchId } = schema.parse(body);
    const session = await requireChurchPermission("members:manage", churchId);
    requireRateLimit(request, { prefix: `link:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });

    // Vérifier que le member et l'user appartiennent bien à l'église concernée
    const member = await prisma.member.findFirst({
      where: { id: memberId, department: { ministry: { churchId } } },
    });
    if (!member) throw new ApiError(404, "STAR introuvable dans cette église");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, "Utilisateur introuvable");

    // Vérifier qu'il n'y a pas déjà un lien pour ce membre ou cet utilisateur dans cette église
    const existingByMember = await prisma.memberUserLink.findUnique({
      where: { memberId },
    });
    if (existingByMember) throw new ApiError(409, "Ce STAR est déjà lié à un compte");

    const existingByUser = await prisma.memberUserLink.findFirst({
      where: { userId, churchId },
    });
    if (existingByUser) throw new ApiError(409, "Cet utilisateur est déjà lié à un STAR dans cette église");

    const link = await prisma.$transaction(async (tx) => {
      const created = await tx.memberUserLink.create({
        data: {
          memberId,
          userId,
          churchId,
          validatedAt: new Date(),
          validatedById: session.user.id,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { displayName: `${member.firstName} ${member.lastName}` },
      });

      return created;
    });

    await logAudit({ userId: session.user.id, churchId, action: "CREATE", entityType: "MemberUserLink", entityId: link.id, details: { memberId, userId } });

    return successResponse(link, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
