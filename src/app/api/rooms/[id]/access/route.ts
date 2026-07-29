import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const bodySchema = z.object({ churchId: z.string().min(1) });

async function requireRoomOwnerManage(roomId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, churchId: true } });
  if (!room) throw new ApiError(404, "Salle introuvable");
  const session = await requireChurchPermission("rooms:manage", room.churchId);
  return { room, session };
}

/** GET /api/rooms/[id]/access — liste des églises autorisées à réserver la salle. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireRoomOwnerManage(id);

    const accesses = await prisma.roomAccess.findMany({
      where: { roomId: id },
      include: { church: { select: { id: true, name: true } } },
      orderBy: { church: { name: "asc" } },
    });

    return successResponse({ accesses: accesses.map((a) => ({ id: a.id, church: a.church })) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/rooms/[id]/access — autorise une église à réserver la salle. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { room, session } = await requireRoomOwnerManage(id);
    const { churchId } = bodySchema.parse(await request.json());

    if (churchId === room.churchId) {
      throw new ApiError(400, "L'église propriétaire a déjà accès à sa propre salle");
    }

    const access = await prisma.roomAccess.upsert({
      where: { roomId_churchId: { roomId: id, churchId } },
      create: { roomId: id, churchId },
      update: {},
    });

    await logAudit({
      userId: session.user.id,
      churchId: room.churchId,
      action: "CREATE",
      entityType: "RoomAccess",
      entityId: access.id,
      details: { roomId: id, churchId },
    });

    return successResponse(access, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/rooms/[id]/access — retire l'autorisation d'une église. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { room, session } = await requireRoomOwnerManage(id);
    const { churchId } = bodySchema.parse(await request.json());

    await prisma.roomAccess.deleteMany({ where: { roomId: id, churchId } });

    await logAudit({
      userId: session.user.id,
      churchId: room.churchId,
      action: "DELETE",
      entityType: "RoomAccess",
      entityId: `${id}:${churchId}`,
      details: { roomId: id, churchId },
    });

    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
