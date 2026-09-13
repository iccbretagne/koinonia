import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const deleteSchema = z.object({ churchId: z.string() });

// Suppression réservée aux comptes pré-provisionnés jamais activés (spec 047) : un compte qui a
// déjà terminé une connexion Google, ou qui porte un rôle dans une autre église, ne peut pas être
// supprimé par ce geste — seul le retrait d'un compte préparé par erreur est couvert ici, pas la
// suppression d'un utilisateur en général (hors périmètre).
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const body = await request.json();
    const { churchId } = deleteSchema.parse(body);
    const session = await requireChurchPermission("members:manage", churchId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: { select: { id: true } },
        churchRoles: { select: { churchId: true } },
      },
    });
    if (!user) throw new ApiError(404, "Utilisateur introuvable");

    if (user.accounts.length > 0) {
      throw new ApiError(409, "Ce compte a déjà été activé, il ne peut pas être supprimé");
    }
    if (user.churchRoles.some((r) => r.churchId !== churchId)) {
      throw new ApiError(409, "Cet utilisateur a des rôles dans une autre église");
    }

    await prisma.$transaction(async (tx) => {
      await tx.userDepartment.deleteMany({ where: { userChurchRole: { userId } } });
      await tx.userChurchRole.deleteMany({ where: { userId } });
      await tx.memberUserLink.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "DELETE",
      entityType: "User",
      entityId: userId,
      details: { email: user.email },
    });

    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
