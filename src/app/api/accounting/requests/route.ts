import { requireCurrentChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { sendEmail, buildAccountingNewRequestEmail, parseEmailList } from "@/lib/email";
import { notifyUsers } from "@/lib/notifications";
import { assertAttachmentsAssignable, getAccountingDepartmentScope, accountingScopeWhere } from "@/modules/accounting";
import { z } from "zod";

const createSchema = z.object({
  type:          z.enum(["EXPENSE_REPORT", "BUDGET_ADVANCE"]),
  label:         z.string().min(1).max(200),
  description:   z.string().optional(),
  amount:        z.number().positive(),
  departmentId:  z.string().min(1).optional(), // null/omis = note de frais personnelle
  attachmentIds: z.array(z.string()).optional(),
  correctionOfId: z.string().min(1).optional(), // demande rejetée que celle-ci corrige
});

export async function GET(request: Request) {
  try {
    const { session, churchId } = await requireCurrentChurchPermission("accounting:view");

    const { searchParams } = new URL(request.url);
    const status     = searchParams.get("status") ?? undefined;
    const departmentId = searchParams.get("departmentId") ?? undefined;
    const type       = searchParams.get("type") ?? undefined;

    // Le filtre ?departmentId= restreint le périmètre autorisé, il ne le remplace jamais.
    const scope = await getAccountingDepartmentScope(session, churchId);

    const requests = await prisma.financialRequest.findMany({
      where: {
        churchId,
        ...(status ? { status: status as never } : {}),
        ...(type ? { type: type as never } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...accountingScopeWhere(scope, session.user.id!),
      },
      include: {
        department:  { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        processedBy: { select: { id: true, name: true } },
        payments:    { orderBy: { scheduledDate: "asc" } },
        attachments: { select: { id: true, filename: true, mimeType: true, size: true, s3Key: true } },
        series:      { select: { id: true, label: true, recurrenceEvery: true, recurrenceUnit: true } },
        correctionOf: { select: { id: true, label: true } },
        _count:      { select: { corrections: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(requests);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, churchId } = await requireCurrentChurchPermission("accounting:submit");

    const body = createSchema.parse(await request.json());

    // Vérifier que le département appartient à l'église (si fourni)
    if (body.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: body.departmentId, ministry: { churchId } },
      });
      if (!dept) throw new ApiError(404, "Département introuvable");
    }

    // Une correction ne peut porter que sur sa propre demande rejetée, dans cette église
    if (body.correctionOfId) {
      const original = await prisma.financialRequest.findFirst({
        where: { id: body.correctionOfId, churchId, submittedById: session.user.id!, status: "REJECTED" },
        select: { id: true },
      });
      if (!original) throw new ApiError(404, "Demande à corriger introuvable");
    }

    const req = await prisma.$transaction(async (tx) => {
      if (body.attachmentIds?.length) {
        await assertAttachmentsAssignable(
          body.attachmentIds,
          { userId: session.user.id!, churchId },
          tx
        );
      }

      return tx.financialRequest.create({
        data: {
          churchId,
          departmentId: body.departmentId ?? undefined,
          submittedById: session.user.id!,
          type:        body.type,
          label:       body.label,
          description: body.description,
          amount:      body.amount,
          status:      "SUBMITTED",
          correctionOfId: body.correctionOfId,
          ...(body.attachmentIds?.length
            ? { attachments: { connect: body.attachmentIds.map((id) => ({ id })) } }
            : {}),
        },
        include: {
          department:  { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true, email: true } },
          attachments: true,
          payments:    true,
        },
      });
    });

    // Notification email compta + in-app (best-effort)
    notifyAccountingTeam(churchId, req).catch(() => {});

    return successResponse(req, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

async function notifyAccountingTeam(
  churchId: string,
  req: { id: string; label: string; type: string; description: string | null; amount: unknown; department: { name: string } | null; submittedBy: { name: string | null; email: string | null } }
) {
  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { accountingEmails: true, name: true },
  });

  const accountants = await prisma.userChurchRole.findMany({
    where: { churchId, role: "ACCOUNTANT" },
    select: { userId: true },
  });
  const accountantIds = accountants.map((a) => a.userId);
  const emails = parseEmailList(church?.accountingEmails);
  if (emails.length === 0 && accountantIds.length === 0) return;

  // Un seul email par destinataire : le gabarit détaillé est passé à la notification, qui
  // l'envoie aux comptables selon leur préférence du domaine "accounting" (spec 053) — sans lui,
  // le helper enverrait en plus son email générique.
  // `||` et non `??` : une variable présente mais vide dans le .env ne doit pas produire un lien relatif
  const appUrl = process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const amount = Number(req.amount).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const email = buildAccountingNewRequestEmail({
    requestLabel:   req.label,
    requestAmount:  amount,
    requestType:    req.type,
    departmentName: req.department?.name ?? "—",
    submitterName:  req.submittedBy.name ?? req.submittedBy.email ?? "—",
    description:    req.description,
    churchName:     church!.name,
    requestUrl:     `${appUrl}/accounting/requests/${req.id}`,
  });

  // Adresse institutionnelle configurée par l'église (church.accountingEmails, liste blanche :
  // destinataire sans compte) — se cumule avec les comptables, ne les remplace pas.
  if (emails.length > 0) {
    sendEmail({ to: emails, ...email })
      .catch((err) => console.error("[accounting] sendEmail to accountingEmails failed:", err?.message ?? err));
  }

  await notifyUsers(
    accountantIds,
    {
      domain:  "accounting",
      type:    "ACCOUNTING_NEW_REQUEST",
      title:   "Nouvelle demande financière",
      message: `${req.type === "EXPENSE_REPORT" ? "Note de frais" : "Avance de budget"} : ${req.label}`,
      link:    `/accounting/requests/${req.id}`,
    },
    { email }
  );
}
