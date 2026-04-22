import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  date: z.string().min(1, "La date est requise"),
  churchId: z.string().min(1, "L'église est requise"),
  description: z.string().nullable().optional(),
  planningEventId: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireChurchPermission("media:view", churchId);

    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const events = await prisma.mediaEvent.findMany({
      where: {
        churchId,
        ...(status ? { status: status as "DRAFT" | "PENDING_REVIEW" | "REVIEWED" | "ARCHIVED" } : {}),
        ...((from || to) ? {
          date: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        } : {}),
      },
      orderBy: { date: "desc" },
      include: {
        church: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, displayName: true } },
        planningEvent: { select: { id: true, title: true, type: true, date: true } },
        _count: { select: { photos: true, files: true } },
      },
    });

    return successResponse(events);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const session = await requireChurchPermission("media:upload", data.churchId);

    // Validate planningEventId belongs to same church
    if (data.planningEventId) {
      const planningEvent = await prisma.event.findUnique({
        where: { id: data.planningEventId },
        select: { churchId: true },
      });
      if (!planningEvent || planningEvent.churchId !== data.churchId) {
        throw new ApiError(400, "Événement planning invalide ou hors périmètre");
      }
    }

    const event = await prisma.mediaEvent.create({
      data: {
        name: data.name,
        date: new Date(data.date),
        churchId: data.churchId,
        description: data.description ?? null,
        planningEventId: data.planningEventId ?? null,
        createdById: session.user.id,
      },
      include: {
        church: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, displayName: true } },
        planningEvent: { select: { id: true, title: true, type: true, date: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "MediaEvent",
      entityId: event.id,
      details: { name: data.name },
    });

    return successResponse(event, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
