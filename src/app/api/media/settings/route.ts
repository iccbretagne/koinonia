/**
 * GET/PUT /api/media/settings
 * Paramètres du module média (logo, favicon, rétention).
 * Accessible aux super admins.
 */
import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const putSchema = z.object({
  retentionDays: z.number().int().min(1).max(365).optional(),
  logoKey: z.string().nullable().optional(),
  faviconKey: z.string().nullable().optional(),
  logoFilename: z.string().nullable().optional(),
  faviconFilename: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireChurchPermission("media:manage", churchId);

    const settings = await prisma.mediaSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
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
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
    });

    return successResponse(settings);
  } catch (error) {
    return errorResponse(error);
  }
}
