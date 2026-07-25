import { prisma } from "@/lib/prisma";
import { requireAuth, requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  declareAbsence,
  findAbsenceConflicts,
  getMemberScope,
  isMemberLinkedToUser,
} from "@/modules/planning";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z
  .object({
    churchId: z.string().min(1),
    memberId: z.string().min(1),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    reason: z.string().max(500).nullable().optional(),
  })
  .refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
    message: "endDate doit être postérieure ou égale à startDate",
    path: ["endDate"],
  });

/**
 * GET /api/absences?churchId=...&scope=self|all&ministryId=&departmentId=&role=
 *
 * scope=self  : absences des fiches STAR liées au compte appelant (aucune permission requise).
 * scope=all   : vue transverse, requiert absences:view, scope départemental comme members:view.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const scope = searchParams.get("scope") === "all" ? "all" : "self";
    const ministryId = searchParams.get("ministryId");
    const departmentId = searchParams.get("departmentId");
    const roleFilter = searchParams.get("role");

    if (!churchId) throw new ApiError(400, "churchId requis");

    let memberIdFilter: string[] | undefined;

    if (scope === "self") {
      const session = await requireAuth();
      const links = await prisma.memberUserLink.findMany({
        where: { userId: session.user.id, churchId },
        select: { memberId: true },
      });
      memberIdFilter = links.map((l) => l.memberId);
      if (memberIdFilter.length === 0) return successResponse({ absences: [] });
    } else {
      const session = await requireChurchPermission("absences:view", churchId);
      const deptScope = getUserDepartmentScope(session, churchId);
      if (deptScope.scoped) {
        if (deptScope.departmentIds.length === 0) return successResponse({ absences: [] });
        const members = await prisma.memberDepartment.findMany({
          where: { departmentId: { in: deptScope.departmentIds } },
          select: { memberId: true },
        });
        memberIdFilter = Array.from(new Set(members.map((m) => m.memberId)));
        if (memberIdFilter.length === 0) return successResponse({ absences: [] });
      }
    }

    if (ministryId || departmentId) {
      const deptFilterIds = await prisma.memberDepartment.findMany({
        where: {
          department: {
            ...(departmentId ? { id: departmentId } : {}),
            ...(ministryId ? { ministryId } : {}),
          },
        },
        select: { memberId: true },
      });
      const filteredMemberIds = new Set(deptFilterIds.map((m) => m.memberId));
      memberIdFilter = memberIdFilter
        ? memberIdFilter.filter((id) => filteredMemberIds.has(id))
        : Array.from(filteredMemberIds);
    }

    const absences = await prisma.absence.findMany({
      where: {
        churchId,
        ...(memberIdFilter ? { memberId: { in: memberIdFilter } } : {}),
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            departments: { select: { department: { select: { id: true, name: true, ministry: { select: { id: true, name: true } } } } } },
          },
        },
        createdBy: { select: { id: true, name: true, displayName: true } },
      },
      orderBy: { startDate: "desc" },
    });

    let result = absences;
    if (roleFilter) {
      const createdByIds = Array.from(new Set(absences.map((a) => a.createdById)));
      const roles = await prisma.userChurchRole.findMany({
        where: { userId: { in: createdByIds }, churchId },
        select: { userId: true, role: true },
      });
      const rolesByUser = new Map<string, string[]>();
      for (const r of roles) {
        rolesByUser.set(r.userId, [...(rolesByUser.get(r.userId) ?? []), r.role]);
      }
      result = absences.filter((a) => (rolesByUser.get(a.createdById) ?? []).includes(roleFilter));
    }

    const enriched = await Promise.all(
      result.map(async (a) => {
        const conflicts = await findAbsenceConflicts(a.memberId, a.churchId, a.startDate, a.endDate);
        return {
          id: a.id,
          member: {
            id: a.member.id,
            firstName: a.member.firstName,
            lastName: a.member.lastName,
            departments: a.member.departments.map((d) => d.department),
          },
          startDate: a.startDate,
          endDate: a.endDate,
          reason: a.reason,
          status: a.status,
          createdBy: { id: a.createdBy.id, name: a.createdBy.displayName ?? a.createdBy.name },
          createdAt: a.createdAt,
          hasConflict: conflicts.length > 0,
          conflicts,
        };
      })
    );

    return successResponse({ absences: enriched });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/absences — déclare une absence.
 *
 * Auto-déclaration (STAR lié à la fiche) : aucune permission requise.
 * Déclaration pour un tiers : requiert absences:manage + périmètre départemental.
 */
export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const data = createSchema.parse(await request.json());
    const { churchId, memberId } = data;

    const memberScope = await getMemberScope(memberId);
    if (!memberScope) throw new ApiError(404, "Fiche STAR introuvable");
    if (memberScope.churchId && memberScope.churchId !== churchId) {
      throw new ApiError(403, "Cette fiche n'appartient pas à cette église");
    }

    const isSelf = await isMemberLinkedToUser(memberId, session.user.id, churchId);

    if (!isSelf) {
      const managerSession = await requireChurchPermission("absences:manage", churchId);
      const deptScope = getUserDepartmentScope(managerSession, churchId);
      if (deptScope.scoped) {
        const withinScope = memberScope.departmentIds.some((id) => deptScope.departmentIds.includes(id));
        if (!withinScope) throw new ApiError(403, "Ce STAR n'appartient pas à votre périmètre");
      }
    }

    const absence = await declareAbsence({
      churchId,
      memberId,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      reason: data.reason,
      createdById: session.user.id,
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "CREATE",
      entityType: "Absence",
      entityId: absence.id,
      details: { memberId, startDate: data.startDate, endDate: data.endDate },
    });

    return successResponse(absence, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
