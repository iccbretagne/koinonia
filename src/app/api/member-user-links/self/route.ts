import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
import { assertSelfLinkAllowed } from "@/lib/onboarding";
import { z } from "zod";

const schema = z.object({
  memberId: z.string(),
  churchId: z.string(),
});

/**
 * POST /api/member-user-links/self — auto-liaison self-service par email (P2).
 *
 * Sécurité : le serveur vérifie TOUJOURS l'égalité (normalisée) entre l'email du
 * compte et l'email de la fiche, que la fiche appartient à l'église visée, et
 * qu'elle n'est pas déjà liée (`assertSelfLinkAllowed`). Aucune validation admin.
 * Le seul rôle jamais attribué ici est `STAR` (identité, pas élévation de privilège),
 * et uniquement si l'utilisateur n'a encore aucun rôle dans cette église.
 */
export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    requireRateLimit(request, { prefix: `self-link:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });

    const { memberId, churchId } = schema.parse(await request.json());

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, email: true },
    });
    if (!member) throw new ApiError(404, "Fiche introuvable");

    await assertSelfLinkAllowed(session.user.email, member, churchId);

    try {
      const link = await prisma.$transaction(async (tx) => {
        const created = await tx.memberUserLink.create({
          data: {
            memberId,
            userId: session.user.id,
            churchId,
            validatedAt: new Date(),
            validatedById: session.user.id,
          },
        });

        // Auto-attribution du rôle STAR uniquement si aucun rôle dans cette église
        const hasAnyRole = await tx.userChurchRole.findFirst({
          where: { userId: session.user.id, churchId },
        });
        if (!hasAnyRole) {
          await tx.userChurchRole.create({
            data: { userId: session.user.id, churchId, role: "STAR" },
          });
        }

        return created;
      });

      await logAudit({
        userId: session.user.id,
        churchId,
        action: "CREATE",
        entityType: "MemberUserLink",
        entityId: link.id,
        details: { memberId, self: true },
      });

      return successResponse(link, 201);
    } catch (error) {
      // Course à la contrainte d'unicité (fiche/compte déjà lié entre-temps)
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
        throw new ApiError(409, "Cette fiche est déjà liée à un compte");
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
