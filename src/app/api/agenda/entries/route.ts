import { prisma } from "@/lib/prisma";
import { requireAgendaView, requireAgendaManage } from "@/modules/agenda/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  churchId: z.string().min(1, "L'église est requise"),
  recipientId: z.string().min(1, "Le profil pastoral est requis"),
  type: z.enum(["ACTIVITY", "APPOINTMENT"]),
  title: z.string().min(1, "Le titre est requis"),
  description: z.string().nullable().optional(),
  startsAt: z.string().datetime("Date de début invalide"),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().nullable().optional(),
}).refine(
  (d) => !d.endsAt || new Date(d.endsAt) > new Date(d.startsAt),
  { message: "L'heure de fin doit être après l'heure de début", path: ["endsAt"] }
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const profileId = searchParams.get("profileId");
    const weekStart = searchParams.get("weekStart"); // ISO date du lundi
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireAgendaView(churchId);

    let from: Date | undefined;
    let to: Date | undefined;
    if (weekStart) {
      from = new Date(weekStart);
      to = new Date(from);
      to.setDate(to.getDate() + 7);
    }

    const entries = await prisma.agendaEntry.findMany({
      where: {
        churchId,
        ...(profileId && { recipientId: profileId }),
        ...(from && to && { startsAt: { gte: from, lt: to } }),
      },
      include: {
        recipient: { select: { id: true, name: true, role: true } },
        request: {
          select: { id: true, firstName: true, lastName: true, subject: true, qualificationNote: true },
        },
        createdBy: { select: { id: true, name: true, displayName: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    return successResponse(entries);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const session = await requireAgendaManage(data.churchId);

    const profile = await prisma.pastoralProfile.findFirst({
      where: { id: data.recipientId, churchId: data.churchId },
      select: { id: true },
    });
    if (!profile) throw new ApiError(400, "Profil pastoral invalide ou hors périmètre");

    const entry = await prisma.agendaEntry.create({
      data: {
        churchId: data.churchId,
        recipientId: data.recipientId,
        type: data.type,
        title: data.title,
        description: data.description ?? null,
        startsAt: new Date(data.startsAt),
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        location: data.location ?? null,
        createdById: session.user.id,
      },
      include: {
        recipient: { select: { id: true, name: true, role: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "AgendaEntry",
      entityId: entry.id,
      details: { type: data.type, title: data.title, recipientId: data.recipientId },
    });

    return successResponse(entry, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
