import { prisma } from "@/lib/prisma";
import { resolveChurchId } from "@/lib/auth";
import { requireAgendaManage } from "@/modules/agenda/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().nullable().optional(),
}).refine(
  (d) => !(d.startsAt && d.endsAt) || new Date(d.endsAt) > new Date(d.startsAt),
  { message: "L'heure de fin doit être après l'heure de début", path: ["endsAt"] }
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("agendaEntry", id);
    await requireAgendaManage(churchId);

    const body = await request.json();
    const data = updateSchema.parse(body);

    const entry = await prisma.agendaEntry.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.startsAt !== undefined && { startsAt: new Date(data.startsAt) }),
        ...(data.endsAt !== undefined && { endsAt: data.endsAt ? new Date(data.endsAt) : null }),
        ...(data.location !== undefined && { location: data.location }),
      },
      include: {
        recipient: { select: { id: true, name: true, role: true } },
      },
    });

    return successResponse(entry);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("agendaEntry", id);
    await requireAgendaManage(churchId);

    const entry = await prisma.agendaEntry.findUnique({
      where: { id },
      select: { requestId: true },
    });
    if (!entry) throw new ApiError(404, "Entrée agenda introuvable");

    await prisma.$transaction(async (tx) => {
      // Si l'entrée est liée à une demande, repasser la demande en VALIDATED
      if (entry.requestId) {
        await tx.appointmentRequest.update({
          where: { id: entry.requestId },
          data: { status: "VALIDATED", scheduledById: null, scheduledAt: null },
        });
      }
      await tx.agendaEntry.delete({ where: { id } });
    });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
