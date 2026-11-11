import { prisma } from "@/lib/prisma";
import { requireMediaCollectionAccess, getMediaShareScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { createMediaShareToken } from "@/modules/media";
import { logAudit } from "@/lib/audit";
import { createSchema } from "./contract";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const session = await requireMediaCollectionAccess(data.churchId);

    if (data.eventIds.length === 0 && data.projectIds.length === 0) {
      throw new ApiError(400, "Sélectionnez au moins un événement ou projet");
    }

    // Le partage est limité au périmètre de la personne (spec 049) : une équipe Photos ne
    // peut pas créer un lien couvrant des visuels, et réciproquement.
    const scope = await getMediaShareScope(session, data.churchId);
    if (data.eventIds.length > 0 && !scope.photos) {
      throw new ApiError(403, "Vous n'avez pas accès aux photos de cette église");
    }
    if (data.projectIds.length > 0 && !scope.visuels) {
      throw new ApiError(403, "Vous n'avez pas accès aux visuels de cette église");
    }

    // Verify all eventIds belong to the church
    if (data.eventIds.length > 0) {
      const events = await prisma.mediaEvent.findMany({
        where: { id: { in: data.eventIds }, churchId: data.churchId },
        select: { id: true },
      });
      if (events.length !== data.eventIds.length) {
        throw new ApiError(400, "Certains événements sont invalides ou hors périmètre");
      }
    }

    // Verify all projectIds belong to the church
    if (data.projectIds.length > 0) {
      const projects = await prisma.mediaProject.findMany({
        where: { id: { in: data.projectIds }, churchId: data.churchId },
        select: { id: true },
      });
      if (projects.length !== data.projectIds.length) {
        throw new ApiError(400, "Certains projets sont invalides ou hors périmètre");
      }
    }

    // Sélection fine (spec 080) : chaque élément doit appartenir aux sources fournies.
    if (data.photoIds?.length) {
      const n = await prisma.mediaPhoto.count({ where: { id: { in: data.photoIds }, mediaEventId: { in: data.eventIds } } });
      if (n !== new Set(data.photoIds).size) throw new ApiError(400, "Certaines photos sont hors des événements choisis");
    }
    if (data.fileIds?.length) {
      const n = await prisma.mediaFile.count({ where: { id: { in: data.fileIds }, mediaProjectId: { in: data.projectIds } } });
      if (n !== new Set(data.fileIds).size) throw new ApiError(400, "Certains visuels sont hors des projets choisis");
    }

    const token = await createMediaShareToken({
      churchId: data.churchId,
      type: "COLLECTION",
      label: data.label,
      expiresInDays: data.expiresInDays,
      collectionConfig: {
        scope: data.scope,
        eventIds: data.eventIds,
        projectIds: data.projectIds,
        includeAllPhotos: data.includeAllPhotos,
        ...(data.photoIds ? { photoIds: data.photoIds } : {}),
        ...(data.fileIds ? { fileIds: data.fileIds } : {}),
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "MediaShareToken",
      entityId: token.id,
      details: {
        type: "COLLECTION",
        scope: data.scope,
        eventIds: data.eventIds,
        projectIds: data.projectIds,
        includeAllPhotos: data.includeAllPhotos ?? false,
        ...(data.photoIds ? { photoCount: data.photoIds.length } : {}),
        ...(data.fileIds ? { fileCount: data.fileIds.length } : {}),
      },
    });

    return successResponse(token, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
