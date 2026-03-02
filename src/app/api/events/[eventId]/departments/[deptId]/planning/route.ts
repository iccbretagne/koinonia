import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermission } from "@/lib/auth";
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
    await requireAuth();
    const { eventId, deptId: departmentId } = await params;

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

    if (!eventDept) {
      throw new ApiError(404, "Event-department link not found");
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
    const session = await requirePermission("planning:edit");
    const { eventId, deptId: departmentId } = await params;

    // Check planning deadline
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { planningDeadline: true },
    });

    if (event?.planningDeadline && new Date() > new Date(event.planningDeadline)) {
      // After deadline, only ADMIN and SECRETARY can modify
      const userRoles = session.user.churchRoles.map((r) => r.role);
      const canBypass = userRoles.some(
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
