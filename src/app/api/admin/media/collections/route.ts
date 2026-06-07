import { prisma } from "@/lib/prisma";
import { requireMediaManageAccess } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { createMediaShareToken } from "@/modules/media";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  churchId: z.string().min(1),
  label: z.string().optional(),
  scope: z.enum(["photos", "files", "both"]),
  eventIds: z.array(z.string()).default([]),
  projectIds: z.array(z.string()).default([]),
  expiresInDays: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const session = await requireMediaManageAccess(data.churchId);

    if (data.eventIds.length === 0 && data.projectIds.length === 0) {
      throw new ApiError(400, "Sélectionnez au moins un événement ou projet");
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

    const token = await createMediaShareToken({
      type: "COLLECTION",
      label: data.label,
      expiresInDays: data.expiresInDays,
      collectionConfig: {
        scope: data.scope,
        eventIds: data.eventIds,
        projectIds: data.projectIds,
      },
      baseUrl: new URL(request.url).origin,
    });

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "MediaShareToken",
      entityId: token.id,
      details: { type: "COLLECTION", scope: data.scope, eventIds: data.eventIds, projectIds: data.projectIds },
    });

    return successResponse(token, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
