import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  churchId: z.string().min(1),
  name: z.string().min(1).max(200),
  capacity: z.number().int().positive().optional(),
  location: z.string().max(200).optional(),
});

/** GET /api/rooms?churchId=... — salles possédées + partagées avec cette église. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireChurchPermission("rooms:view", churchId);

    const rooms = await prisma.room.findMany({
      where: {
        OR: [{ churchId }, { sharedWith: { some: { churchId } } }],
      },
      include: { church: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });

    return successResponse({
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        location: r.location,
        isActive: r.isActive,
        isOwner: r.churchId === churchId,
        ownerChurch: { id: r.church.id, name: r.church.name },
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/rooms — crée une salle (propriété de l'église appelante). */
export async function POST(request: Request) {
  try {
    const data = createSchema.parse(await request.json());
    const session = await requireChurchPermission("rooms:manage", data.churchId);

    const room = await prisma.room.create({
      data: {
        churchId: data.churchId,
        name: data.name,
        capacity: data.capacity ?? null,
        location: data.location ?? null,
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "Room",
      entityId: room.id,
      details: { name: room.name },
    });

    return successResponse(room, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
