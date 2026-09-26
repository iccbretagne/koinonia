import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { deleteNeverConnectedUser } from "@/modules/core";
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
    const session = await requireChurchPermission("users:manage", churchId);

    const user = await deleteNeverConnectedUser(userId, churchId);

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
