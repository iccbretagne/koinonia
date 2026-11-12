import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId, requireDepartmentAccess } from "@/lib/auth";
import {
  successResponse,
  errorResponse,
  ApiError,
} from "@/lib/api-utils";
import { getPlanningAvailability, listPendingWithdrawalsForSlot } from "@/modules/planning";
import { rolePermissions } from "@/lib/registry";
import { planningSchema } from "./contract";
import { savePlanning } from "./_core";

type PlanningAvailability = Awaited<ReturnType<typeof getPlanningAvailability>>;

/** Disponibilités dérivées (spec 058) sérialisées pour la grille — jamais stockées comme statut de planning. */
function serializeAvailability(av: PlanningAvailability, memberId: string) {
  const m = av.members.get(memberId);
  return m ?? null;
}

async function availabilityPayload(
  churchId: string,
  event: { id: string; date: Date },
  departmentId: string,
  memberIds: string[],
  canAskTeam: boolean
) {
  const av = await getPlanningAvailability(churchId, event, departmentId, memberIds);
  let manualRelanceAvailable = false;
  if (canAskTeam && av.counts.noResponse > 0) {
    const ask = await prisma.availabilityAsk.findUnique({
      where: { eventId_departmentId: { eventId: event.id, departmentId } },
      select: { manualRelanceAt: true },
    });
    const today = new Date();
    manualRelanceAvailable =
      ask?.manualRelanceAt?.toDateString() !== today.toDateString();
  }
  return { av, counts: av.counts, canAskTeam, manualRelanceAvailable };
}

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; deptId: string }> }
) {
  try {
    const { eventId, deptId: departmentId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:view", churchId);

    // Vérifier le scope département : un DEPARTMENT_HEAD ne peut voir que ses départements
    requireDepartmentAccess(session, churchId, departmentId);

    const churchRoles = session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .map((r) => r.role);
    const canBypassDeadline = churchRoles.some(
      (r) => r === "SUPER_ADMIN" || r === "ADMIN" || r === "SECRETARY"
    );
    const canAskTeam = churchRoles.some((r) => rolePermissions[r]?.includes("planning:edit"));

    // Verify department belongs to same church as event
    const deptCheck = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { ministry: { select: { churchId: true } } },
    });
    if (!deptCheck) throw new ApiError(404, "Département introuvable");
    if (deptCheck.ministry.churchId !== churchId) {
      throw new ApiError(403, "Ce département n'appartient pas à l'église de cet événement");
    }

    const eventDept = await prisma.eventDepartment.findUnique({
      where: {
        eventId_departmentId: { eventId, departmentId },
      },
      include: {
        event: { select: { date: true, planningDeadline: true } },
        plannings: {
          include: { member: true },
        },
        department: {
          include: {
            memberDepts: {
              include: { member: true },
              orderBy: { member: { lastName: "asc" } },
            },
          },
        },
      },
    });

    // If no EventDepartment link, return members with no planning statuses
    if (!eventDept) {
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        include: {
          memberDepts: {
            include: { member: true },
            orderBy: { member: { lastName: "asc" } },
          },
        },
      });

      if (!department) {
        throw new ApiError(404, "Department not found");
      }

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { date: true, planningDeadline: true },
      });

      const deadlinePassed = event?.planningDeadline
        ? new Date() > new Date(event.planningDeadline)
        : false;

      const payload = event
        ? await availabilityPayload(
            churchId,
            { id: eventId, date: event.date },
            departmentId,
            department.memberDepts.map(({ member }) => member.id),
            canAskTeam
          )
        : null;

      return successResponse({
        eventDepartment: null,
        members: department.memberDepts.map(({ member: m }) => ({
          ...m,
          status: null,
          planningId: null,
          availability: payload ? serializeAvailability(payload.av, m.id) : null,
        })),
        planningDeadline: event?.planningDeadline ?? null,
        deadlinePassed,
        canBypassDeadline,
        counts: payload ? { ...payload.counts, toReplace: 0 } : null,
        withdrawals: [],
        canAskTeam,
        manualRelanceAvailable: payload?.manualRelanceAvailable ?? false,
      });
    }

    const payload = await availabilityPayload(
      churchId,
      { id: eventId, date: eventDept.event.date },
      departmentId,
      eventDept.department.memberDepts.map(({ member }) => member.id),
      canAskTeam
    );

    // Services rendus vacants par un désistement (spec 061) : bandeau et ligne « à remplacer ».
    const withdrawals = await listPendingWithdrawalsForSlot(eventId, departmentId);

    const members = eventDept.department.memberDepts.map(({ member }) => {
      const planning = eventDept.plannings.find(
        (p) => p.memberId === member.id
      );
      return {
        ...member,
        status: planning?.status || null,
        planningId: planning?.id || null,
        availability: serializeAvailability(payload.av, member.id),
      };
    });

    const deadlinePassed = eventDept.event.planningDeadline
      ? new Date() > new Date(eventDept.event.planningDeadline)
      : false;

    return successResponse({
      eventDepartment: eventDept,
      members,
      planningDeadline: eventDept.event.planningDeadline,
      deadlinePassed,
      canBypassDeadline,
      counts: { ...payload.counts, toReplace: withdrawals.length },
      withdrawals,
      canAskTeam,
      manualRelanceAvailable: payload.manualRelanceAvailable,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; deptId: string }> }
) {
  try {
    const { eventId, deptId: departmentId } = await params;
    const eventChurchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:edit", eventChurchId);

    // Vérifier le scope département : un DEPARTMENT_HEAD ne peut éditer que ses départements
    requireDepartmentAccess(session, eventChurchId, departmentId);

    const { plannings } = planningSchema.parse(await request.json());
    const results = await savePlanning(session, eventChurchId, eventId, departmentId, plannings);

    return successResponse(results);
  } catch (error) {
    return errorResponse(error);
  }
}
