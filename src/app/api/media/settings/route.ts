/**
 * GET/PUT /api/media/settings
 * Paramètres du module média (logo, favicon, rétention).
 * Accessible aux super admins.
 */
import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { putSchema } from "./contract";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireChurchPermission("media:manage", churchId);

    const settings = await prisma.mediaSettings.upsert({
      where: { churchId },
      update: {},
      create: { churchId },
    });

    return successResponse(settings);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireChurchPermission("media:manage", churchId);

    const body = await request.json();
    const data = putSchema.parse(body);

    const settings = await prisma.mediaSettings.upsert({
      where: { churchId },
      update: data,
      create: { churchId, ...data },
    });

    return successResponse(settings);
  } catch (error) {
    return errorResponse(error);
  }
}
