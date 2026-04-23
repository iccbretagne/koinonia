import { prisma } from "@/lib/prisma";
import { requireMediaAccess, requireMediaUploadAccess } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  churchId: z.string().min(1, "L'église est requise"),
  description: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireMediaAccess(churchId);

    const projects = await prisma.mediaProject.findMany({
      where: { churchId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, displayName: true } },
        _count: { select: { files: true, shareTokens: true } },
      },
    });

    return successResponse(projects);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const session = await requireMediaUploadAccess(data.churchId);

    const project = await prisma.mediaProject.create({
      data: {
        name: data.name,
        churchId: data.churchId,
        description: data.description ?? null,
        createdById: session.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, displayName: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "MediaProject",
      entityId: project.id,
      details: { name: data.name },
    });

    return successResponse(project, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
