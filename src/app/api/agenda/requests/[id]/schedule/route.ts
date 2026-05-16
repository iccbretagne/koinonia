import { prisma } from "@/lib/prisma";
import { resolveChurchId } from "@/lib/auth";
import { requireAgendaManage } from "@/modules/agenda/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const scheduleSchema = z.object({
  startsAt: z.string().datetime("Date de début invalide"),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}).refine(
  (d) => !d.endsAt || new Date(d.endsAt) > new Date(d.startsAt),
  { message: "L'heure de fin doit être après l'heure de début", path: ["endsAt"] }
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("appointmentRequest", id);
    const session = await requireAgendaManage(churchId);

    const existing = await prisma.appointmentRequest.findUnique({
      where: { id },
      select: { status: true, subject: true, assignedToId: true },
    });
    if (!existing) throw new ApiError(404, "Demande introuvable");
    if (existing.status !== "VALIDATED") {
      throw new ApiError(400, "Seules les demandes VALIDÉES peuvent être planifiées");
    }
    if (!existing.assignedToId) {
      throw new ApiError(400, "La demande n'est pas assignée à un profil pastoral");
    }

    const body = await request.json();
    const data = scheduleSchema.parse(body);

    const [, entry] = await prisma.$transaction([
      prisma.appointmentRequest.update({
        where: { id },
        data: {
          status: "SCHEDULED",
          scheduledById: session.user.id,
          scheduledAt: new Date(),
          updatedById: session.user.id,
        },
      }),
      prisma.agendaEntry.create({
        data: {
          churchId,
          recipientId: existing.assignedToId,
          type: "APPOINTMENT",
          title: data.title ?? existing.subject,
          description: data.description ?? null,
          startsAt: new Date(data.startsAt),
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
          location: data.location ?? null,
          requestId: id,
          createdById: session.user.id,
        },
        include: {
          recipient: { select: { id: true, name: true, role: true } },
          request: { select: { id: true, firstName: true, lastName: true, subject: true } },
        },
      }),
    ]);

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "AppointmentRequest",
      entityId: id,
      details: { transition: "VALIDATED→SCHEDULED", entryId: entry.id, startsAt: data.startsAt },
    });

    return successResponse(entry, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
