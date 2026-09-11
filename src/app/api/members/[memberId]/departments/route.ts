import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { resolveMemberDepartmentScope } from "@/lib/member-scope";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { attachMemberToDepartment, detachMemberFromDepartment } from "@/modules/planning";
import { z } from "zod";

const addSchema = z.object({ departmentId: z.string().min(1, "Le département est requis") });

/**
 * Rattache un STAR existant à un département.
 *
 * Le PUT de la fiche STAR ne permet pas ce geste à un périmètre restreint : il ne liste que les
 * STAR déjà visibles. Ici le STAR peut venir de n'importe quel département de l'église, seul le
 * département de destination doit appartenir au périmètre de l'appelant.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;
    const { departmentId } = addSchema.parse(await request.json());

    const churchId = await resolveChurchId("department", departmentId);
    const session = await requireChurchPermission("members:manage", churchId);
    const scope = await resolveMemberDepartmentScope(session, churchId);
    if (scope.scoped && !scope.departmentIds.includes(departmentId)) {
      throw new ApiError(403, "Ce département n'est pas dans votre périmètre");
    }

    const updated = await attachMemberToDepartment(memberId, departmentId, churchId);

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "Member",
      entityId: memberId,
      details: { addedDepartmentId: departmentId },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Retire un STAR d'un département sans supprimer sa fiche.
 *
 * Le DELETE de la fiche refuse un STAR partiellement hors périmètre ; c'est ici que se fait le
 * retrait ciblé. Refusé sur la dernière affiliation : un STAR sans département n'appartiendrait
 * plus à aucune église.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;
    const departmentId = new URL(request.url).searchParams.get("departmentId");
    if (!departmentId) throw new ApiError(400, "departmentId requis");

    const churchId = await resolveChurchId("member", memberId);
    const session = await requireChurchPermission("members:manage", churchId);
    const scope = await resolveMemberDepartmentScope(session, churchId);
    if (scope.scoped && !scope.departmentIds.includes(departmentId)) {
      throw new ApiError(403, "Ce département n'est pas dans votre périmètre");
    }

    const updated = await detachMemberFromDepartment(memberId, departmentId);

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "Member",
      entityId: memberId,
      details: { removedDepartmentId: departmentId },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
