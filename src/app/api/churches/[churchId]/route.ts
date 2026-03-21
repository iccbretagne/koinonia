import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  slug: z.string().min(1, "Le slug est requis"),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ churchId: string }> }
) {
  try {
    const { churchId } = await params;
    await requireChurchPermission("church:manage", churchId);
    const body = await request.json();
    const data = updateSchema.parse(body);

    const church = await prisma.church.update({
      where: { id: churchId },
      data,
    });

    return successResponse(church);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ churchId: string }> }
) {
  try {
    const { churchId } = await params;
    await requireChurchPermission("church:manage", churchId);

    const church = await prisma.church.findUnique({
      where: { id: churchId },
      include: { _count: { select: { users: true, ministries: true, events: true } } },
    });

    if (!church) {
      throw new ApiError(404, "Église introuvable");
    }

    if (church._count.users > 0 || church._count.ministries > 0 || church._count.events > 0) {
      throw new ApiError(
        400,
        "Impossible de supprimer une église qui contient des données"
      );
    }

    await prisma.church.delete({ where: { id: churchId } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
