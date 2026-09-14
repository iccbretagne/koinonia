import { prisma } from "@/lib/prisma";
import { requireAuth, requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  cancelAbsence,
  updateAbsence,
  getMemberScope,
  isMemberLinkedToUser,
  type DeclarerScope,
} from "@/modules/planning";
import { logAudit } from "@/lib/audit";
import { assertBackupsAllowed, backupSchema } from "../route";
import { z } from "zod";

const patchSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("cancel") }),
    z.object({
      action: z.literal("update"),
      kind: z.enum(["PERIOD", "EVENTS"]).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      eventIds: z.array(z.string().min(1)).max(52).optional(),
      allDepartments: z.boolean().optional(),
      departmentIds: z.array(z.string().min(1)).optional(),
      reason: z.string().max(500).nullable().optional(),
      backups: z.array(backupSchema).max(10).optional(),
    }),
  ])
  .refine(
    (d) => d.action !== "update" || !d.startDate || !d.endDate || new Date(d.endDate) >= new Date(d.startDate),
    { message: "endDate doit être postérieure ou égale à startDate", path: ["endDate"] }
  )
  .refine(
    (d) => d.action !== "update" || d.allDepartments === undefined || d.allDepartments || (d.departmentIds?.length ?? 0) > 0,
    { message: "Au moins un département doit être ciblé", path: ["departmentIds"] }
  )
  .refine(
    (d) => d.action !== "update" || d.kind !== "EVENTS" || (d.eventIds?.length ?? 0) > 0,
    { message: "Au moins un événement doit être ciblé", path: ["eventIds"] }
  );

/**
 * PATCH /api/absences/[id] — `cancel` (annulation) ou `update` (modification tant que non passée).
 *
 * Autorisé : le créateur, la fiche STAR liée elle-même, un resp./ministre du
 * périmètre du membre, ou un manager global (absences:manage sans scope).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const data = patchSchema.parse(await request.json());

    const absence = await prisma.absence.findUnique({ where: { id } });
    if (!absence) throw new ApiError(404, "Absence introuvable");

    const isCreator = absence.createdById === session.user.id;
    const isSelf = await isMemberLinkedToUser(absence.memberId, session.user.id, absence.churchId);

    let declarerScope: DeclarerScope = { scoped: false, departmentIds: [] };

    if (!isCreator && !isSelf) {
      const managerSession = await requireChurchPermission("absences:manage", absence.churchId);
      const deptScope = getUserDepartmentScope(managerSession, absence.churchId);
      if (deptScope.scoped) {
        const memberScope = await getMemberScope(absence.memberId);
        const withinScope = memberScope?.departmentIds.some((d) => deptScope.departmentIds.includes(d)) ?? false;
        if (!withinScope) throw new ApiError(403, "Ce STAR n'appartient pas à votre périmètre");
        declarerScope = deptScope;
      }
    }

    if (data.action === "cancel") {
      const updated = await cancelAbsence({
        absenceId: id,
        churchId: absence.churchId,
        cancelledById: session.user.id,
      });

      await logAudit({
        userId: session.user.id,
        churchId: absence.churchId,
        action: "UPDATE",
        entityType: "Absence",
        entityId: id,
        details: { status: "CANCELLED" },
      });

      return successResponse(updated);
    }

    await assertBackupsAllowed(data.backups, isSelf, session.user.id, absence.memberId, absence.churchId);

    const updated = await updateAbsence({
      absenceId: id,
      churchId: absence.churchId,
      updatedById: session.user.id,
      kind: data.kind,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      eventIds: data.eventIds,
      allDepartments: data.allDepartments,
      departmentIds: data.departmentIds,
      reason: data.reason,
      backups: data.backups,
      declarerScope,
    });

    await logAudit({
      userId: session.user.id,
      churchId: absence.churchId,
      action: "UPDATE",
      entityType: "Absence",
      entityId: id,
      details: { startDate: data.startDate, endDate: data.endDate },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
