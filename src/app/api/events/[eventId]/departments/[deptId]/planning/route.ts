import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId, requireDepartmentAccess } from "@/lib/auth";
import {
  successResponse,
  errorResponse,
  ApiError,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { getPlanningAvailability, recordPlanningChanges } from "@/modules/planning";
import { rolePermissions } from "@/lib/registry";
import { z } from "zod";

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
        counts: payload?.counts ?? null,
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
      counts: payload.counts,
      canAskTeam,
      manualRelanceAvailable: payload.manualRelanceAvailable,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const planningSchema = z.object({
  plannings: z.array(
    z.object({
      memberId: z.string(),
      status: z
        .enum(["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"])
        .nullable(),
    })
  ),
});

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

    // Check planning deadline
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { planningDeadline: true, title: true },
    });

    if (event?.planningDeadline && new Date() > new Date(event.planningDeadline)) {
      // After deadline, only ADMIN and SECRETARY in this church can modify
      const churchRoles = session.user.churchRoles
        .filter((r) => r.churchId === eventChurchId)
        .map((r) => r.role);
      const canBypass = churchRoles.some(
        (r) => r === "SUPER_ADMIN" || r === "ADMIN" || r === "SECRETARY"
      );
      if (!canBypass) {
        throw new ApiError(
          403,
          "La date limite de planification est dépassée"
        );
      }
    }

    const body = await request.json();
    const { plannings } = planningSchema.parse(body);

    // Verify department belongs to same church as event
    const planDeptCheck = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { ministry: { select: { churchId: true } } },
    });
    if (!planDeptCheck) throw new ApiError(404, "Département introuvable");
    if (planDeptCheck.ministry.churchId !== eventChurchId) {
      throw new ApiError(403, "Ce département n'appartient pas à l'église de cet événement");
    }

    // Find or create event-department link
    let eventDept = await prisma.eventDepartment.findUnique({
      where: {
        eventId_departmentId: { eventId, departmentId },
      },
    });

    if (!eventDept) {
      eventDept = await prisma.eventDepartment.create({
        data: { eventId, departmentId },
      });
    }

    // Validate: all members must belong to this department
    const memberIds = plannings.map((p) => p.memberId);
    if (memberIds.length > 0) {
      const validMembers = await prisma.member.findMany({
        where: { id: { in: memberIds }, departments: { some: { departmentId } } },
        select: { id: true },
      });
      if (validMembers.length !== memberIds.length) {
        throw new ApiError(400, "Un ou plusieurs membres n'appartiennent pas à ce département");
      }
    }

    // Validate: only one EN_SERVICE_DEBRIEF per department per event
    const debriefCount = plannings.filter(
      (p) => p.status === "EN_SERVICE_DEBRIEF"
    ).length;
    if (debriefCount > 1) {
      throw new ApiError(
        400,
        "Only one member can have EN_SERVICE_DEBRIEF status per department per event"
      );
    }

    // Snapshot état précédent pour détecter les changements à notifier
    const prevPlannings = memberIds.length > 0
      ? await prisma.planning.findMany({
          where: { eventDepartmentId: eventDept!.id, memberId: { in: memberIds } },
          select: { memberId: true, status: true },
        })
      : [];
    const prevStatusMap = new Map(prevPlannings.map((p) => [p.memberId, p.status]));

    const results = await Promise.all(
      plannings.map((p) =>
        prisma.planning.upsert({
          where: {
            eventDepartmentId_memberId: {
              eventDepartmentId: eventDept!.id,
              memberId: p.memberId,
            },
          },
          update: { status: p.status },
          create: {
            eventDepartmentId: eventDept!.id,
            memberId: p.memberId,
            status: p.status,
          },
        })
      )
    );

    await logAudit({
      userId: session.user.id,
      churchId: eventChurchId,
      action: "UPDATE",
      entityType: "Planning",
      entityId: eventDept!.id,
      details: { eventId, departmentId, count: plannings.length },
    });

    // Les STAR dont le service change sont prévenus en un seul récapitulatif, une fois le délai
    // de l'église écoulé sans nouvelle modification (spec 060) ; rien ne part ici.
    try {
      await recordPlanningChanges(
        prisma,
        eventChurchId,
        plannings
          .filter((p) => (prevStatusMap.get(p.memberId) ?? null) !== p.status)
          .map((p) => ({
            memberId: p.memberId,
            eventId,
            departmentId,
            previousStatus: prevStatusMap.get(p.memberId) ?? null,
          })),
        { actorId: session.user.id }
      );
    } catch (error) {
      console.error("[planning] enregistrement des changements à notifier impossible", error);
    }

    return successResponse(results);
  } catch (error) {
    return errorResponse(error);
  }
}
