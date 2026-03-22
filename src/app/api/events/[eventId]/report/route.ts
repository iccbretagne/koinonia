import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const sectionSchema = z.object({
  id: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  label: z.string().min(1),
  position: z.number().int().default(0),
  stats: z.record(z.string(), z.number().int().nullable()).nullable().optional(),
  notes: z.string().nullable().optional(),
});

const upsertSchema = z.object({
  speaker: z.string().nullable().optional(),
  messageTitle: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  decisions: z.string().nullable().optional(),
  sections: z.array(sectionSchema),
});

// GET /api/events/[eventId]/report
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    // reports:view OR events:manage — try both, fail if neither
    let authorized = false;
    for (const perm of ["reports:view", "events:manage"] as const) {
      try {
        await requireChurchPermission(perm, churchId);
        authorized = true;
        break;
      } catch { /* try next */ }
    }
    if (!authorized) throw new ApiError(403, "Accès refusé");

    const report = await prisma.eventReport.findUnique({
      where: { eventId },
      include: {
        sections: {
          include: { department: { select: { id: true, name: true, ministry: { select: { name: true } } } } },
          orderBy: { position: "asc" },
        },
        author: { select: { id: true, name: true } },
      },
    });

    return successResponse(report ?? null);
  } catch (error) {
    return errorResponse(error);
  }
}

// PUT /api/events/[eventId]/report — crée ou remplace le rapport complet
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, churchId: true, reportEnabled: true },
    });
    if (!event) throw new ApiError(404, "Événement introuvable");

    // reports:edit OR events:manage — try both, fail if neither
    let session;
    let putAuthorized = false;
    for (const perm of ["reports:edit", "events:manage"] as const) {
      try {
        session = await requireChurchPermission(perm, event.churchId);
        putAuthorized = true;
        break;
      } catch { /* try next */ }
    }
    if (!putAuthorized || !session) throw new ApiError(403, "Accès refusé");

    if (!event.reportEnabled) throw new ApiError(403, "Les comptes rendus ne sont pas activés pour cet événement");

    const { speaker, messageTitle, notes, decisions, sections } = upsertSchema.parse(await request.json());

    // Validate all departmentIds belong to the event's church
    const deptIds = sections.map((s) => s.departmentId).filter((id): id is string => id !== null && id !== undefined);
    if (deptIds.length > 0) {
      const validDepts = await prisma.department.findMany({
        where: { id: { in: deptIds }, ministry: { churchId: event.churchId } },
        select: { id: true },
      });
      if (validDepts.length !== new Set(deptIds).size) {
        throw new ApiError(400, "Un ou plusieurs départements n'appartiennent pas à cette église");
      }
    }

    const sectionData = sections.map((s, i) => ({
      departmentId: s.departmentId ?? null,
      label: s.label,
      position: s.position ?? i,
      stats: (s.stats as Prisma.InputJsonValue) ?? Prisma.DbNull,
      notes: s.notes ?? null,
    }));

    const report = await prisma.eventReport.upsert({
      where: { eventId },
      create: {
        eventId,
        churchId: event.churchId,
        authorId: session.user.id,
        speaker: speaker ?? null,
        messageTitle: messageTitle ?? null,
        notes: notes ?? null,
        decisions: decisions ?? null,
        sections: { create: sectionData },
      },
      update: {
        speaker: speaker ?? null,
        messageTitle: messageTitle ?? null,
        notes: notes ?? null,
        decisions: decisions ?? null,
        sections: {
          deleteMany: {},
          create: sectionData,
        },
      },
      include: {
        sections: {
          include: { department: { select: { id: true, name: true, ministry: { select: { name: true } } } } },
          orderBy: { position: "asc" },
        },
        author: { select: { id: true, name: true } },
      },
    });

    await logAudit({ userId: session.user.id, churchId: event.churchId, action: "UPDATE", entityType: "EventReport", entityId: report.id, details: { eventId } });

    return successResponse(report);
  } catch (error) {
    return errorResponse(error);
  }
}
