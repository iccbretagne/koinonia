import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rolePermissions } from "@/lib/registry";
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
      // users:manage peut modifier le profil d'un utilisateur avec qui il partage une église
      // (spec 054/#583 — remplace le contrôle de rôle codé en dur SUPER_ADMIN/ADMIN/SECRETARY,
      // qui approximait déjà cette permission sans passer par rolePermissions)
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { churchRoles: { select: { churchId: true } } },
      });
      if (!targetUser) throw new ApiError(404, "Utilisateur introuvable");

      const targetChurchIds = new Set(targetUser.churchRoles.map((r) => r.churchId));
      const hasSharedChurchAccess = session.user.isSuperAdmin
        ? true
        : session.user.churchRoles.some(
            (r) =>
              targetChurchIds.has(r.churchId) &&
              (rolePermissions[r.role] ?? []).includes("users:manage")
          );

      if (!hasSharedChurchAccess) {
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
