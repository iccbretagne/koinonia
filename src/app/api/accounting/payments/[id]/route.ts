import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { rolePermissions } from "@/lib/registry";
import { sendEmail, buildAccountingPaymentEmail } from "@/lib/email";
import { z } from "zod";

const releaseSchema = z.object({
  releasedAt:     z.string().datetime(),
  releasedAmount: z.number().positive(),
  note:           z.string().max(500).optional(),
});

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
    if (!perms.includes("accounting:manage")) throw new ApiError(403, "Accès refusé");

    const payment = await prisma.financialPayment.findUnique({
      where: { id },
      include: { request: { select: { churchId: true, label: true, submittedById: true, amount: true } } },
    });
    if (!payment || payment.request.churchId !== churchId) throw new ApiError(404, "Paiement introuvable");
    if (payment.releasedAt) throw new ApiError(400, "Ce paiement a déjà été confirmé");

    const body = releaseSchema.parse(await request.json());
    const planned = Number(payment.amount);
    const released = body.releasedAmount;

    if (released > planned) {
      throw new ApiError(400, `Le montant remis (${released} €) ne peut pas dépasser le montant prévu (${planned} €)`);
    }

    const isPartial = released < planned;
    const remainder = Number((planned - released).toFixed(2));

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.financialPayment.update({
        where: { id },
        data: {
          releasedAt:     new Date(body.releasedAt),
          releasedAmount: released,
          releasedById:   session.user.id!,
          note:           body.note ?? payment.note,
        },
      });

      // Si remise partielle → créer une tranche résiduelle non confirmée
      let residual = null;
      if (isPartial) {
        residual = await tx.financialPayment.create({
          data: {
            requestId:     payment.requestId,
            amount:        remainder,
            scheduledDate: new Date(body.releasedAt), // à planifier par la comptable
            note:          `Solde restant de la tranche partiellement versée le ${new Date(body.releasedAt).toLocaleDateString("fr-FR")}`,
          },
        });
      }

      return { updated, residual };
    });

    // Notif demandeur (in-app)
    const partialMsg = isPartial
      ? ` (partiel : ${released} € sur ${planned} €, solde de ${remainder} € reporté)`
      : "";
    await prisma.notification.create({
      data: {
        userId:  payment.request.submittedById,
        type:    "ACCOUNTING_PAYMENT_RELEASED",
        title:   "Fonds remis",
        message: `Un paiement pour "${payment.request.label}" a été confirmé remis${partialMsg}.`,
        link:    `/accounting/requests/${payment.requestId}`,
      },
    });

    // Email — fire-and-forget
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const trancheNumber = await prisma.financialPayment.count({
      where: { requestId: payment.requestId, scheduledDate: { lte: payment.scheduledDate } },
    });
    prisma.user.findUnique({ where: { id: payment.request.submittedById }, select: { name: true, email: true } })
      .then(async (user) => {
        if (!user?.email) return;
        const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
        const fmt = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
        const { subject, html } = buildAccountingPaymentEmail({
          userName:       user.name ?? user.email,
          requestLabel:   payment.request.label,
          trancheNumber,
          releasedAmount: fmt(released),
          plannedAmount:  fmt(planned),
          isPartial,
          residualAmount: isPartial ? fmt(remainder) : undefined,
          churchName:     church?.name ?? "Koinonia",
          requestUrl:     `${appUrl}/accounting/requests/${payment.requestId}`,
        });
        return sendEmail({ to: user.email, subject, html });
      })
      .catch((err) => console.error("[accounting/payments] sendEmail failed:", err?.message ?? err));

    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
