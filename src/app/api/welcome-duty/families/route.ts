import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const createSchema = z.object({
  familyId:   z.number().int().positive(),
  familyName: z.string().min(1).max(100),
});

export async function GET(request: Request) {
  try {
    const session = await requirePermission("events:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") !== "false";

    const families = await prisma.welcomeDutyFamily.findMany({
      where: { churchId, ...(activeOnly ? { active: true } : {}) },
      include: {
        assignments: {
          include: { event: { select: { id: true, title: true, date: true } } },
          orderBy: { event: { date: "desc" } },
          take: 1,
        },
      },
      orderBy: { familyName: "asc" },
    });

    return successResponse(families);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("events:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const body = createSchema.parse(await request.json());

    const existing = await prisma.welcomeDutyFamily.findUnique({
      where: { churchId_familyId: { churchId, familyId: body.familyId } },
    });

    if (existing) {
      // Réactiver si désactivée
      if (!existing.active) {
        const updated = await prisma.welcomeDutyFamily.update({
          where: { id: existing.id },
          data: { active: true, familyName: body.familyName },
        });
        return successResponse(updated);
      }
      throw new ApiError(409, "Cette famille est déjà dans le pool");
    }

    const family = await prisma.welcomeDutyFamily.create({
      data: { churchId, familyId: body.familyId, familyName: body.familyName },
    });

    return successResponse(family, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
