import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { DEPT_FN } from "@/lib/department-functions";
import { z } from "zod";

const createSchema = z
  .object({
    churchId: z.string().min(1, "L'église est requise"),
    title: z.string().min(1, "Le titre est requis"),
    content: z.string().min(1, "Le contenu est requis"),
    eventDate: z.string().nullable().optional(),
    channelInterne: z.boolean().default(false),
    channelExterne: z.boolean().default(false),
    isUrgent: z.boolean().default(false),
    departmentId: z.string().nullable().optional(),
    ministryId: z.string().nullable().optional(),
    targetEventIds: z.array(z.string()).default([]),
  })
  .refine((d) => d.channelInterne || d.channelExterne, {
    message: "Au moins un canal de diffusion est requis",
  });

function computeIsSaveTheDate(eventDate: Date): boolean {
  const threeWeeksFromNow = new Date();
  threeWeeksFromNow.setDate(threeWeeksFromNow.getDate() + 21);
  return eventDate > threeWeeksFromNow;
}

async function findDeptByFunction(churchId: string, fn: string) {
  return prisma.department.findFirst({
    where: { function: fn, ministry: { churchId } },
    select: { id: true },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    const session = await requireChurchPermission("planning:view", churchId);

    const userPermissions = new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === churchId)
        .flatMap((r) => hasPermission(r.role))
    );
    const canManage =
      session.user.isSuperAdmin || userPermissions.has("events:manage");

    const announcements = await prisma.announcement.findMany({
      where: {
        churchId,
        ...(canManage ? {} : { submittedById: session.user.id }),
      },
      include: {
        submittedBy: { select: { id: true, name: true, displayName: true } },
        department: { select: { id: true, name: true } },
        ministry: { select: { id: true, name: true } },
        targetEvents: {
          include: {
            event: { select: { id: true, title: true, date: true } },
          },
        },
        requests: {
          where: { parentRequestId: null },
          select: {
            id: true,
            type: true,
            status: true,
            payload: true,
            assignedDept: { select: { id: true, name: true } },
            childRequests: {
              select: {
                id: true,
                type: true,
                status: true,
                payload: true,
              },
            },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    return successResponse(announcements);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);
    const session = await requireChurchPermission("planning:view", data.churchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    // Validate departmentId belongs to churchId
    if (data.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: data.departmentId, ministry: { churchId: data.churchId } },
        select: { id: true },
      });
      if (!dept) throw new ApiError(400, "Département invalide ou hors périmètre");
    }

    // Validate ministryId belongs to churchId
    if (data.ministryId) {
      const ministry = await prisma.ministry.findFirst({
        where: { id: data.ministryId, churchId: data.churchId },
        select: { id: true },
      });
      if (!ministry) throw new ApiError(400, "Ministère invalide ou hors périmètre");
    }

    // Validate targetEventIds belong to churchId
    if (data.targetEventIds.length > 0) {
      const validEvents = await prisma.event.count({
        where: { id: { in: data.targetEventIds }, churchId: data.churchId },
      });
      if (validEvents !== data.targetEventIds.length) {
        throw new ApiError(400, "Événements cibles invalides ou hors périmètre");
      }
    }

    const eventDate = data.eventDate ? new Date(data.eventDate) : null;
    const saveTheDate = eventDate ? computeIsSaveTheDate(eventDate) : false;

    const [secretariatDept, communicationDept, productionDept] =
      await Promise.all([
        data.channelInterne
          ? findDeptByFunction(data.churchId, DEPT_FN.SECRETARIAT)
          : null,
        data.channelExterne
          ? findDeptByFunction(data.churchId, DEPT_FN.COMMUNICATION)
          : null,
        findDeptByFunction(data.churchId, DEPT_FN.PRODUCTION_MEDIA),
      ]);

    const announcement = await prisma.$transaction(async (tx) => {
      const ann = await tx.announcement.create({
        data: {
          churchId: data.churchId,
          submittedById: session.user.id,
          departmentId: data.departmentId ?? null,
          ministryId: data.ministryId ?? null,
          title: data.title,
          content: data.content,
          eventDate,
          isSaveTheDate: saveTheDate,
          isUrgent: data.isUrgent,
          channelInterne: data.channelInterne,
          channelExterne: data.channelExterne,
          ...(data.targetEventIds.length > 0 && {
            targetEvents: {
              create: data.targetEventIds.map((eventId) => ({ eventId })),
            },
          }),
        },
      });

      if (data.channelInterne) {
        const diffusion = await tx.request.create({
          data: {
            churchId: data.churchId,
            type: "DIFFUSION_INTERNE",
            submittedById: session.user.id,
            departmentId: data.departmentId ?? null,
            ministryId: data.ministryId ?? null,
            assignedDeptId: secretariatDept?.id ?? null,
            announcementId: ann.id,
            title: data.title,
            payload: {
              brief: data.content,
              deadline: eventDate?.toISOString() ?? null,
            },
          },
        });
        await tx.request.create({
          data: {
            churchId: data.churchId,
            type: "VISUEL",
            submittedById: session.user.id,
            departmentId: data.departmentId ?? null,
            ministryId: data.ministryId ?? null,
            assignedDeptId: productionDept?.id ?? null,
            announcementId: ann.id,
            parentRequestId: diffusion.id,
            title: `Visuel — ${data.title}`,
            payload: {
              brief: data.content,
              format: "Slide / Affiche event",
              deadline: eventDate?.toISOString() ?? null,
            },
          },
        });
      }

      if (data.channelExterne) {
        const social = await tx.request.create({
          data: {
            churchId: data.churchId,
            type: "RESEAUX_SOCIAUX",
            submittedById: session.user.id,
            departmentId: data.departmentId ?? null,
            ministryId: data.ministryId ?? null,
            assignedDeptId: communicationDept?.id ?? null,
            announcementId: ann.id,
            title: data.title,
            payload: {
              brief: data.content,
              deadline: eventDate?.toISOString() ?? null,
            },
          },
        });
        await tx.request.create({
          data: {
            churchId: data.churchId,
            type: "VISUEL",
            submittedById: session.user.id,
            departmentId: data.departmentId ?? null,
            ministryId: data.ministryId ?? null,
            assignedDeptId: productionDept?.id ?? null,
            announcementId: ann.id,
            parentRequestId: social.id,
            title: `Visuel réseaux — ${data.title}`,
            payload: {
              brief: data.content,
              format: "Story / Post réseaux sociaux",
              deadline: eventDate?.toISOString() ?? null,
            },
          },
        });
      }

      return ann;
    });

    await logAudit({ userId: session.user.id, churchId: data.churchId, action: "CREATE", entityType: "Announcement", entityId: announcement.id, details: { title: data.title } });

    return successResponse(announcement, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
