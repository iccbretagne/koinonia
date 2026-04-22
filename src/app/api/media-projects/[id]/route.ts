import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { deleteFiles } from "@/lib/s3";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("mediaProject", id);
    await requireChurchPermission("media:view", churchId);

    const project = await prisma.mediaProject.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, displayName: true } },
        _count: { select: { files: true, shareTokens: true } },
      },
    });

    if (!project) throw new ApiError(404, "Projet média introuvable");
    return successResponse(project);
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
    const churchId = await resolveChurchId("mediaProject", id);
    const session = await requireChurchPermission("media:upload", churchId);

    const body = await request.json();
    const data = patchSchema.parse(body);

    const project = await prisma.mediaProject.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
      include: {
        createdBy: { select: { id: true, name: true, displayName: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "MediaProject",
      entityId: id,
      details: data,
    });

    return successResponse(project);
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
    const churchId = await resolveChurchId("mediaProject", id);
    const session = await requireChurchPermission("media:manage", churchId);

    const project = await prisma.mediaProject.findUnique({
      where: { id },
      include: {
        files: {
          include: { versions: { select: { originalKey: true, thumbnailKey: true } } },
        },
      },
    });

    if (!project) throw new ApiError(404, "Projet média introuvable");

    const s3Keys = project.files.flatMap((f) =>
      f.versions.flatMap((v) => [v.originalKey, v.thumbnailKey])
    );
    if (s3Keys.length > 0) await deleteFiles(s3Keys);

    await prisma.mediaProject.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "DELETE",
      entityType: "MediaProject",
      entityId: id,
    });

    return successResponse({ deleted: id });
  } catch (error) {
    return errorResponse(error);
  }
}
