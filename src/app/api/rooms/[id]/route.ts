import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  capacity: z.number().int().positive().nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/rooms/[id] — modifie une salle (réservé à l'église propriétaire). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) throw new ApiError(404, "Salle introuvable");

    const session = await requireChurchPermission("rooms:manage", room.churchId);
    const data = patchSchema.parse(await request.json());

    const updated = await prisma.room.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.capacity !== undefined && { capacity: data.capacity }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: room.churchId,
      action: "UPDATE",
      entityType: "Room",
      entityId: id,
      details: data,
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
