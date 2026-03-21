import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await requireAuth();
    const { userId } = await params;

    // User can edit own profile
    const isSelf = session.user.id === userId;

    if (!isSelf) {
      // Admin/secretary can edit profile of users who share at least one church
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { churchRoles: { select: { churchId: true } } },
      });
      if (!targetUser) throw new ApiError(404, "Utilisateur introuvable");

      const targetChurchIds = new Set(targetUser.churchRoles.map((r) => r.churchId));
      const hasSharedChurchAdmin = session.user.churchRoles.some(
        (r) =>
          ["SUPER_ADMIN", "ADMIN", "SECRETARY"].includes(r.role) &&
          targetChurchIds.has(r.churchId)
      );

      if (!hasSharedChurchAdmin) {
        throw new ApiError(403, "Non autorisé");
      }
    }

    const data = updateProfileSchema.parse(await request.json());

    const user = await prisma.user.update({
      where: { id: userId },
      data: { displayName: data.displayName },
      select: { id: true, displayName: true },
    });

    await logAudit({ userId: session.user.id, action: "UPDATE", entityType: "UserProfile", entityId: userId, details: { displayName: data.displayName } });

    return successResponse(user);
  } catch (error) {
    return errorResponse(error);
  }
}
