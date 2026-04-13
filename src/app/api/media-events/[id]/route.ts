import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { deleteFiles } from "@/lib/s3";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "REVIEWED", "ARCHIVED"]).optional(),
  planningEventId: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("mediaEvent", id);
    await requireChurchPermission("media:view", churchId);

    const event = await prisma.mediaEvent.findUnique({
      where: { id },
      include: {
        church: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, displayName: true } },
        planningEvent: { select: { id: true, title: true, type: true, date: true } },
        _count: { select: { photos: true, files: true, shareTokens: true } },
        photos: {
          select: { status: true },
        },
      },
    });

    if (!event) throw new ApiError(404, "Événement média introuvable");
    return successResponse(event);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("mediaEvent", id);
    const session = await requireChurchPermission("media:upload", churchId);

    const body = await request.json();
    const data = patchSchema.parse(body);

    if (data.planningEventId) {
      const pe = await prisma.event.findUnique({
        where: { id: data.planningEventId },
        select: { churchId: true },
      });
      if (!pe || pe.churchId !== churchId) {
        throw new ApiError(400, "Événement planning invalide ou hors périmètre");
      }
    }

    const event = await prisma.mediaEvent.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.planningEventId !== undefined && { planningEventId: data.planningEventId }),
      },
      include: {
        church: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, displayName: true } },
        planningEvent: { select: { id: true, title: true, type: true, date: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "MediaEvent",
      entityId: id,
      details: data,
    });

    return successResponse(event);
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
    const churchId = await resolveChurchId("mediaEvent", id);
    const session = await requireChurchPermission("media:manage", churchId);

    // Load all S3 keys before deletion
    const event = await prisma.mediaEvent.findUnique({
      where: { id },
      include: {
        photos: { select: { originalKey: true, thumbnailKey: true } },
        files: {
          include: { versions: { select: { originalKey: true, thumbnailKey: true } } },
        },
      },
    });

    if (!event) throw new ApiError(404, "Événement média introuvable");

    const s3Keys = [
      ...event.photos.flatMap((p) => [p.originalKey, p.thumbnailKey]),
      ...event.files.flatMap((f) => f.versions.flatMap((v) => [v.originalKey, v.thumbnailKey])),
    ];

    if (s3Keys.length > 0) {
      await deleteFiles(s3Keys);
    }

    // ON DELETE CASCADE handles photos, files, shareTokens
    await prisma.mediaEvent.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "DELETE",
      entityType: "MediaEvent",
      entityId: id,
    });

    return successResponse({ deleted: id });
  } catch (error) {
    return errorResponse(error);
  }
}
