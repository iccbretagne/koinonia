import { prisma } from "@/lib/prisma";
import { resolveChurchId } from "@/lib/auth";
import { requireAgendaQualify } from "@/modules/agenda/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { createNotification, notifyDeptMembers } from "@/lib/notifications";
import { sendEmail, buildAppointmentRejectedEmail } from "@/lib/email";
import { DEPT_FN } from "@/lib/department-functions";
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
      select: { status: true, userId: true, email: true, firstName: true, lastName: true, subject: true, churchId: true },
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
          updatedById: session.user.id,
        },
        include: {
          assignedTo: { select: { id: true, name: true, role: true } },
        },
      });

      await logAudit({
        userId: session.user.id,
        churchId,
        action: "UPDATE",
        entityType: "AppointmentRequest",
        entityId: id,
        details: { transition: "PENDING→VALIDATED", assignedToId: data.assignedToId },
      });

      // Notify Protocole dept members that a request is ready to schedule
      notifyDeptMembers(churchId, DEPT_FN.PROTOCOLE, {
        type: "AGENDA_REQUEST_VALIDATED",
        title: "Demande RDV à planifier",
        message: `La demande de ${existing.firstName} ${existing.lastName} (« ${existing.subject} ») est prête à être planifiée.`,
        link: "/agenda/schedule",
      }).catch(() => {});

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
        updatedById: session.user.id,
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "AppointmentRequest",
      entityId: id,
      details: { transition: "PENDING→REJECTED", rejectReason: data.rejectReason ?? null },
    });

    // Notify demandeur
    if (existing.userId) {
      createNotification({
        userId: existing.userId,
        type: "AGENDA_REQUEST_REJECTED",
        title: "Demande de RDV non retenue",
        message: `Votre demande « ${existing.subject} » n'a pas pu être retenue.${data.rejectReason ? ` Motif : ${data.rejectReason}` : ""}`,
        link: "/requests",
      }).catch(() => {});
    }
    if (existing.email) {
      const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
      if (church) {
        const { subject: emailSubject, html } = buildAppointmentRejectedEmail({
          firstName: existing.firstName,
          lastName: existing.lastName,
          subject: existing.subject,
          churchName: church.name,
          rejectReason: data.rejectReason ?? null,
        });
        sendEmail({ to: existing.email, subject: emailSubject, html }).catch((err) => {
          console.error("[qualify] sendEmail rejected failed:", err?.message ?? err);
        });
      }
    }

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
