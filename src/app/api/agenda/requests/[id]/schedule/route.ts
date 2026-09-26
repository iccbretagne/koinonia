import { prisma } from "@/lib/prisma";
import { resolveChurchId } from "@/lib/auth";
import { requireAgendaManage } from "@/modules/agenda/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { sendEmail, buildAppointmentScheduledEmail } from "@/lib/email";
import { markAppointmentScheduled, NEUTRAL_REQUEST_LABEL } from "@/modules/care";
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

/**
 * Orchestrateur (spec 052, ADR-0015) : le Protocole planifie toujours dans l'agenda, mais la
 * demande de rendez-vous appartient à `care`. Écriture de l'entrée d'agenda (service `agenda`)
 * et passage à SCHEDULED (service `care`) dans la même transaction. Le titre par défaut ne
 * reprend plus `subject` (traité comme confidentiel, spec 052) : « Rendez-vous pastoral —
 * Prénom Nom ».
 */
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
      select: { status: true, assignedToId: true, userId: true, email: true, firstName: true, lastName: true, subject: true },
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
    const startsAt = new Date(data.startsAt);
    const defaultTitle = `${NEUTRAL_REQUEST_LABEL} — ${existing.firstName} ${existing.lastName}`;

    const entry = await prisma.$transaction(async (tx) => {
      await markAppointmentScheduled(tx, {
        id,
        scheduledById: session.user.id!,
        scheduledFor: startsAt,
      });

      return tx.agendaEntry.create({
        data: {
          churchId,
          recipientId: existing.assignedToId!,
          type: "APPOINTMENT",
          title: data.title ?? defaultTitle,
          description: data.description ?? null,
          startsAt,
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
          location: data.location ?? null,
          requestId: id,
          createdById: session.user.id!,
        },
        include: {
          recipient: { select: { id: true, name: true, role: true } },
        },
      });
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "AppointmentRequest",
      entityId: id,
      details: { transition: "VALIDATED→SCHEDULED", entryId: entry.id, startsAt: data.startsAt },
    });

    // Notify demandeur — contenu complet réservé à son propre email/notification.
    const dateStr = startsAt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const timeStr = startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (existing.userId) {
      // Compte : email gouverné par la préférence du domaine "care" (spec 053), via le helper
      // partagé — jamais un envoi direct pour un demandeur qui a un compte.
      let emailContent: { subject: string; html: string } | undefined;
      if (existing.email) {
        const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
        if (church) {
          // Contenu complet dans l'email au demandeur : c'est sa propre demande, pas une fuite
          // vers un tiers (protocole, secrétariat) — seul le titre d'agenda et la réponse API
          // masquent `subject`.
          const { subject: emailSubject, html } = buildAppointmentScheduledEmail({
            firstName: existing.firstName,
            lastName: existing.lastName,
            subject: existing.subject,
            churchName: church.name,
            startsAt,
            location: data.location ?? null,
          });
          emailContent = { subject: emailSubject, html };
        }
      }
      createNotification(
        {
          userId: existing.userId,
          domain: "care",
          type: "CARE_APPOINTMENT_SCHEDULED",
          title: "Rendez-vous pastoral confirmé",
          message: `Votre demande « ${existing.subject} » a été planifiée le ${dateStr} à ${timeStr}.`,
          link: "/requests",
        },
        emailContent ? { email: emailContent } : undefined
      ).catch(() => {});
    } else if (existing.email) {
      // Demandeur sans compte (formulaire public) : seul canal possible, aucune préférence à consulter.
      const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
      if (church) {
        const { subject: emailSubject, html } = buildAppointmentScheduledEmail({
          firstName: existing.firstName,
          lastName: existing.lastName,
          subject: existing.subject,
          churchName: church.name,
          startsAt,
          location: data.location ?? null,
        });
        sendEmail({ to: existing.email, subject: emailSubject, html }).catch((err) => {
          console.error("[schedule] sendEmail failed:", err?.message ?? err);
        });
      }
    }

    return successResponse(entry, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
