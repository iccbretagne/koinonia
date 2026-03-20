import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const sectionSchema = z.object({
  id: z.string().optional(),          // présent si mise à jour d'une section existante
  departmentId: z.string().nullable().optional(),
  label: z.string().min(1),
  position: z.number().int().default(0),
  present: z.number().int().nullable().optional(),
  absent: z.number().int().nullable().optional(),
  newcomers: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const upsertSchema = z.object({
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
    await requirePermission("events:view");
    const { eventId } = await params;

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
    const session = await requirePermission("events:manage");
    const { eventId } = await params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, churchId: true, reportEnabled: true },
    });
    if (!event) throw new ApiError(404, "Événement introuvable");
    if (!event.reportEnabled) throw new ApiError(403, "Les comptes rendus ne sont pas activés pour cet événement");

    const { notes, decisions, sections } = upsertSchema.parse(await request.json());

    const report = await prisma.eventReport.upsert({
      where: { eventId },
      create: {
        eventId,
        churchId: event.churchId,
        authorId: session.user.id,
        notes: notes ?? null,
        decisions: decisions ?? null,
        sections: {
          create: sections.map((s, i) => ({
            departmentId: s.departmentId ?? null,
            label: s.label,
            position: s.position ?? i,
            present: s.present ?? null,
            absent: s.absent ?? null,
            newcomers: s.newcomers ?? null,
            notes: s.notes ?? null,
          })),
        },
      },
      update: {
        notes: notes ?? null,
        decisions: decisions ?? null,
        sections: {
          deleteMany: {},
          create: sections.map((s, i) => ({
            departmentId: s.departmentId ?? null,
            label: s.label,
            position: s.position ?? i,
            present: s.present ?? null,
            absent: s.absent ?? null,
            newcomers: s.newcomers ?? null,
            notes: s.notes ?? null,
          })),
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

    return successResponse(report);
  } catch (error) {
    return errorResponse(error);
  }
}
