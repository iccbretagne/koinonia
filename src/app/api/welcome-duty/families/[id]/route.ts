import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("events:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const { id } = await params;
    const family = await prisma.welcomeDutyFamily.findFirst({ where: { id, churchId } });
    if (!family) throw new ApiError(404, "Famille introuvable");

    const body = await request.json();
    const updated = await prisma.welcomeDutyFamily.update({
      where: { id },
      data: {
        ...(typeof body.active === "boolean" ? { active: body.active } : {}),
        ...(body.familyName ? { familyName: body.familyName } : {}),
      },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("events:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const { id } = await params;
    const family = await prisma.welcomeDutyFamily.findFirst({ where: { id, churchId } });
    if (!family) throw new ApiError(404, "Famille introuvable");

    await prisma.welcomeDutyFamily.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
