import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import {
  successResponse,
  errorResponse,
  ApiError,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; deptId: string }> }
) {
  try {
    const { eventId, deptId: departmentId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    await requireChurchPermission("planning:view", churchId);

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
        event: { select: { planningDeadline: true } },
        plannings: {
          include: { member: true },
        },
        department: {
          include: { members: { orderBy: { lastName: "asc" } } },
        },
      },
    });

    // If no EventDepartment link, return members with no planning statuses
    if (!eventDept) {
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        include: { members: { orderBy: { lastName: "asc" } } },
      });

      if (!department) {
        throw new ApiError(404, "Department not found");
      }

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { planningDeadline: true },
      });

      const deadlinePassed = event?.planningDeadline
        ? new Date() > new Date(event.planningDeadline)
        : false;

      return successResponse({
        eventDepartment: null,
        members: department.members.map((m) => ({
          ...m,
          status: null,
          planningId: null,
        })),
        planningDeadline: event?.planningDeadline ?? null,
        deadlinePassed,
      });
    }

    const members = eventDept.department.members.map((member) => {
      const planning = eventDept.plannings.find(
        (p) => p.memberId === member.id
      );
      return {
        ...member,
        status: planning?.status || null,
        planningId: planning?.id || null,
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
        .enum(["EN_SERVICE", "EN_SERVICE_DEBRIEF", "INDISPONIBLE", "REMPLACANT"])
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

    // Check planning deadline
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { planningDeadline: true },
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

    return successResponse(results);
  } catch (error) {
    return errorResponse(error);
  }
}
