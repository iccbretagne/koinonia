import { prisma } from "@/lib/prisma";
import { resolveChurchId, requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  role: z.enum(["PASTEUR", "ASSISTANT_PASTEUR", "BERGER"]).optional(),
  userId: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("pastoralProfile", id);
    await requireChurchPermission("church:manage", churchId);

    const body = await request.json();
    const data = updateSchema.parse(body);

    if (data.userId) {
      const user = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { id: true },
      });
      if (!user) throw new ApiError(400, "Utilisateur introuvable");
    }

    const profile = await prisma.pastoralProfile.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.role !== undefined && { role: data.role }),
        ...(data.userId !== undefined && { userId: data.userId }),
      },
    });

    return successResponse(profile);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("pastoralProfile", id);
    await requireChurchPermission("church:manage", churchId);

    const hasEntries = await prisma.agendaEntry.count({ where: { recipientId: id } });
    if (hasEntries > 0) {
      throw new ApiError(400, "Impossible de supprimer un profil qui a des entrées agenda. Supprimez d'abord les entrées.");
    }

    await prisma.pastoralProfile.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
