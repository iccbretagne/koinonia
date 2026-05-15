import { prisma } from "@/lib/prisma";
import { resolveChurchId } from "@/lib/auth";
import { requireAgendaQualify } from "@/modules/agenda";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const qualifySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("VALIDATE"),
    assignedToId: z.string().min(1, "Le profil pastoral est requis"),
    qualificationNote: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal("REJECT"),
    rejectReason: z.string().nullable().optional(),
  }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("appointmentRequest", id);
    const session = await requireAgendaQualify(churchId);

    const existing = await prisma.appointmentRequest.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) throw new ApiError(404, "Demande introuvable");
    if (existing.status !== "PENDING") {
      throw new ApiError(400, "Seules les demandes EN ATTENTE peuvent être qualifiées");
    }

    const body = await request.json();
    const data = qualifySchema.parse(body);

    if (data.action === "VALIDATE") {
      const profile = await prisma.pastoralProfile.findFirst({
        where: { id: data.assignedToId, churchId },
        select: { id: true },
      });
      if (!profile) throw new ApiError(400, "Profil pastoral invalide ou hors périmètre");

      const updated = await prisma.appointmentRequest.update({
        where: { id },
        data: {
          status: "VALIDATED",
          assignedToId: data.assignedToId,
          qualifiedById: session.user.id,
          qualifiedAt: new Date(),
          qualificationNote: data.qualificationNote ?? null,
        },
        include: {
          assignedTo: { select: { id: true, name: true, role: true } },
        },
      });
      return successResponse(updated);
    }

    // REJECT
    const updated = await prisma.appointmentRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        qualifiedById: session.user.id,
        qualifiedAt: new Date(),
        rejectReason: data.rejectReason ?? null,
      },
    });
    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
