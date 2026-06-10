import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { rolePermissions } from "@/lib/registry";
import { sendEmail, buildAccountingStatusEmail } from "@/lib/email";
import { z } from "zod";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action:       z.literal("process"),
    priority:     z.enum(["URGENT", "NORMAL"]),
    priorityNote: z.string().max(500).optional(),
  }),
  z.object({
    action:          z.literal("approve"),
    payments: z.array(z.object({
      amount:        z.number().positive(),
      scheduledDate: z.string().datetime(),
      note:          z.string().max(500).optional(),
    })).min(1),
  }),
  z.object({
    action:          z.literal("reject"),
    rejectionReason: z.string().min(1),
  }),
  z.object({
    action: z.literal("cancel"),
  }),
]);

function hasPermission(permissions: string[], perm: string) {
  return permissions.includes(perm);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
    const perms = roles.flatMap((r) => rolePermissions[r] ?? []);
    if (!hasPermission(perms, "accounting:view")) throw new ApiError(403, "Accès refusé");

    const req = await prisma.financialRequest.findUnique({
      where: { id },
      include: {
        department:   { select: { id: true, name: true, ministry: { select: { name: true } } } },
        submittedBy:  { select: { id: true, name: true, email: true } },
        processedBy:  { select: { id: true, name: true } },
        payments:     { orderBy: { scheduledDate: "asc" }, include: { releasedBy: { select: { id: true, name: true } } } },
        attachments:  true,
        series:       { select: { id: true, label: true, recurrenceEvery: true, recurrenceUnit: true, status: true } },
        correctionOf: { select: { id: true, label: true, status: true } },
        corrections:  { select: { id: true, label: true, status: true, createdAt: true } },
      },
    });

    if (!req || req.churchId !== churchId) throw new ApiError(404, "Demande introuvable");

    // Scope dept_head : seulement ses départements
    if (!hasPermission(perms, "accounting:manage")) {
      const userRoles = await prisma.userChurchRole.findMany({
        where: { userId: session.user.id!, churchId },
        include: { departments: { select: { departmentId: true } } },
      });
      const deptIds = userRoles.flatMap((r) => r.departments.map((d) => d.departmentId));
      if (!deptIds.includes(req.departmentId) && req.submittedById !== session.user.id!) {
        throw new ApiError(403, "Accès refusé");
      }
    }

    return successResponse(req);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
    const perms = roles.flatMap((r) => rolePermissions[r] ?? []);

    const existing = await prisma.financialRequest.findUnique({ where: { id } });
    if (!existing || existing.churchId !== churchId) throw new ApiError(404, "Demande introuvable");

    const body = patchSchema.parse(await request.json());

    if (body.action === "cancel") {
      // Seul le demandeur peut annuler, seulement si SUBMITTED
      if (existing.submittedById !== session.user.id!) throw new ApiError(403, "Accès refusé");
      if (existing.status !== "SUBMITTED") throw new ApiError(400, "Seule une demande en attente peut être annulée");

      const updated = await prisma.financialRequest.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      await notifySubmitter(existing, "CANCELLED", churchId);
      return successResponse(updated);
    }

    // Les autres actions requièrent accounting:manage
    if (!hasPermission(perms, "accounting:manage")) throw new ApiError(403, "Accès refusé");

    if (body.action === "process") {
      if (existing.status !== "SUBMITTED") throw new ApiError(400, "La demande n'est pas en attente");
      const updated = await prisma.financialRequest.update({
        where: { id },
        data: {
          status:       "PROCESSING",
          priority:     body.priority,
          priorityNote: body.priorityNote,
          processedById: session.user.id!,
          processedAt:  new Date(),
        },
      });
      await notifySubmitter(existing, "PROCESSING", churchId, body.priority, body.priorityNote);
      return successResponse(updated);
    }

    if (body.action === "approve") {
      if (existing.status !== "PROCESSING") throw new ApiError(400, "La demande n'est pas en cours de traitement");

      const updated = await prisma.$transaction(async (tx) => {
        const req = await tx.financialRequest.update({
          where: { id },
          data: { status: "APPROVED" },
        });
        await tx.financialPayment.createMany({
          data: body.payments.map((p) => ({
            requestId:     id,
            amount:        p.amount,
            scheduledDate: new Date(p.scheduledDate),
            note:          p.note,
          })),
        });
        // Si demande récurrente : créer l'occurrence suivante
        if (existing.seriesId) {
          await createNextOccurrence(tx, existing);
        }
        return req;
      });

      await notifySubmitter(existing, "APPROVED", churchId);
      return successResponse(updated);
    }

    if (body.action === "reject") {
      if (!["SUBMITTED", "PROCESSING"].includes(existing.status)) {
        throw new ApiError(400, "Cette demande ne peut plus être rejetée");
      }
      const updated = await prisma.financialRequest.update({
        where: { id },
        data: {
          status:          "REJECTED",
          rejectionReason: body.rejectionReason,
          processedById:   session.user.id!,
          processedAt:     new Date(),
        },
      });
      await notifySubmitter(existing, "REJECTED", churchId, undefined, undefined, body.rejectionReason);
      return successResponse(updated);
    }

    throw new ApiError(400, "Action inconnue");
  } catch (error) {
    return errorResponse(error);
  }
}

async function createNextOccurrence(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  current: { seriesId: string | null; churchId: string; departmentId: string; submittedById: string; type: string; label: string; description: string | null; amount: unknown; occurrenceNumber: number | null }
) {
  if (!current.seriesId) return;
  const series = await tx.financialSeries.findUnique({ where: { id: current.seriesId } });
  if (!series || series.status !== "ACTIVE") return;

  const nextDate = new Date(series.nextOccurrenceDate);
  if (series.recurrenceUnit === "WEEK") {
    nextDate.setDate(nextDate.getDate() + series.recurrenceEvery * 7);
  } else {
    nextDate.setMonth(nextDate.getMonth() + series.recurrenceEvery);
  }

  await tx.financialSeries.update({
    where: { id: series.id },
    data: { nextOccurrenceDate: nextDate },
  });

  await tx.financialRequest.create({
    data: {
      churchId:        current.churchId,
      departmentId:    current.departmentId,
      submittedById:   current.submittedById,
      seriesId:        current.seriesId,
      occurrenceNumber: (current.occurrenceNumber ?? 1) + 1,
      type:            current.type as never,
      label:           current.label,
      description:     current.description,
      amount:          current.amount as never,
      status:          "SUBMITTED",
    },
  });
}

async function notifySubmitter(
  req: { submittedById: string; id: string; label: string; amount: unknown; churchId: string },
  status: string,
  _churchId: string,
  priority?: string,
  priorityNote?: string,
  rejectionReason?: string
) {
  const messages: Record<string, string> = {
    PROCESSING: priority === "URGENT"
      ? `Votre demande "${req.label}" est en cours de traitement (priorité urgente${priorityNote ? ` — ${priorityNote}` : ""}).`
      : `Votre demande "${req.label}" est en cours de traitement. Elle sera traitée dans les meilleurs délais.`,
    APPROVED:   `Votre demande "${req.label}" a été validée. Consultez le plan de paiement sur votre fiche.`,
    REJECTED:   `Votre demande "${req.label}" a été rejetée. Consultez le motif sur votre fiche.`,
    CANCELLED:  `Votre demande "${req.label}" a été annulée.`,
  };

  const titles: Record<string, string> = {
    PROCESSING: "Demande prise en charge",
    APPROVED:   "Demande validée ✓",
    REJECTED:   "Demande rejetée",
    CANCELLED:  "Demande annulée",
  };

  await prisma.notification.create({
    data: {
      userId:  req.submittedById,
      type:    `ACCOUNTING_${status}`,
      title:   titles[status] ?? "Mise à jour demande",
      message: messages[status] ?? `Statut mis à jour : ${status}`,
      link:    `/accounting/requests/${req.id}`,
    },
  });

  // Email — fire-and-forget, ne bloque pas la réponse
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  prisma.user.findUnique({ where: { id: req.submittedById }, select: { name: true, email: true } })
    .then(async (user) => {
      if (!user?.email) return;
      const church = await prisma.church.findUnique({ where: { id: req.churchId }, select: { name: true } });
      const amount = Number(req.amount).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
      const { subject, html } = buildAccountingStatusEmail({
        userName:        user.name ?? user.email,
        requestLabel:    req.label,
        requestAmount:   amount,
        status:          status as "PROCESSING" | "APPROVED" | "REJECTED" | "CANCELLED",
        priority,
        priorityNote,
        rejectionReason,
        churchName:      church?.name ?? "Koinonia",
        requestUrl:      `${appUrl}/accounting/requests/${req.id}`,
      });
      return sendEmail({ to: user.email, subject, html });
    })
    .catch((err) => console.error("[accounting] sendEmail failed:", err?.message ?? err));
}
