import { randomUUID } from "node:crypto";
import type { FinancialRequestType, Prisma } from "@/generated/prisma/client";
import { sendEmail, buildAccountingNewRequestEmail, parseEmailList } from "@/lib/email";

/**
 * Création et notification des demandes financières, partagées par la route
 * `POST /api/accounting/requests` et par les modules qui étendent la comptabilité (navette,
 * spec 073). Prisma, l'email et les notifications sont importés à l'appel.
 */

type RequestForNotification = {
  id: string;
  label: string;
  type: string;
  description: string | null;
  amount: unknown;
  department: { name: string } | null;
  submittedBy: { name: string | null; email: string | null };
};

/**
 * Prévient la compta d'une nouvelle demande : comptables de l'église (notification et email selon
 * leur préférence du domaine "accounting") et adresses comptables de l'église (sans compte).
 */
export async function notifyAccountingNewRequest(churchId: string, req: RequestForNotification): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const { notifyUsers } = await import("@/lib/notifications");

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

export interface LinkedExpenseReportInput {
  churchId: string;
  departmentId: string | null;
  submittedById: string;
  label: string;
  description: string | null;
  amount: number;
  /** Justificatif à recopier sous une clé propre à la comptabilité. */
  receipt: { key: string; filename: string; mimeType: string; size: number } | null;
}

/**
 * Crée une note de frais au nom d'un membre, pour un module qui étend la comptabilité (lien A
 * de la navette, spec 073). Le justificatif est **copié** : chaque module supprime ses fichiers
 * sans toucher à ceux de l'autre. Prévient la compta comme une demande ordinaire.
 */
export async function createLinkedExpenseReport(input: LinkedExpenseReportInput) {
  const { prisma } = await import("@/lib/prisma");
  const { readStoredFile, storeFile } = await import("@/lib/file-storage");

  let attachment: Prisma.FinancialAttachmentCreateWithoutRequestInput | null = null;
  if (input.receipt) {
    const bytes = await readStoredFile(input.receipt.key);
    if (bytes) {
      const ext = input.receipt.filename.split(".").pop()?.toLowerCase() ?? "bin";
      const s3Key = `accounting/${input.churchId}/${Date.now()}-${randomUUID()}.${ext}`;
      await storeFile(s3Key, bytes, input.receipt.mimeType);
      attachment = {
        church: { connect: { id: input.churchId } },
        uploadedBy: { connect: { id: input.submittedById } },
        s3Key,
        filename: input.receipt.filename,
        mimeType: input.receipt.mimeType,
        size: input.receipt.size,
      };
    }
  }

  const type: FinancialRequestType = "EXPENSE_REPORT";
  const req = await prisma.financialRequest.create({
    data: {
      churchId: input.churchId,
      departmentId: input.departmentId ?? undefined,
      submittedById: input.submittedById,
      type,
      label: input.label,
      description: input.description ?? undefined,
      amount: input.amount,
      status: "SUBMITTED",
      ...(attachment ? { attachments: { create: [attachment] } } : {}),
    },
    include: {
      department: { select: { name: true } },
      submittedBy: { select: { name: true, email: true } },
    },
  });

  notifyAccountingNewRequest(input.churchId, req).catch(() => {});
  return req;
}

/**
 * Annule une demande par son auteur tant qu'elle n'est pas traitée (même règle que dans la
 * comptabilité). Renvoie `false` si la demande n'est plus annulable.
 */
export async function cancelOwnRequest(requestId: string, submittedById: string): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  const { count } = await prisma.financialRequest.updateMany({
    where: { id: requestId, submittedById, status: "SUBMITTED" },
    data: { status: "CANCELLED" },
  });
  return count > 0;
}

/** État et versements de demandes, pour les afficher dans un module qui les relie. */
export async function getRequestsProgress(ids: string[]) {
  if (ids.length === 0) return [];
  const { prisma } = await import("@/lib/prisma");
  return prisma.financialRequest.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      status: true,
      amount: true,
      rejectionReason: true,
      payments: { select: { releasedAt: true, releasedAmount: true } },
    },
  });
}

/** Tranches versées des avances de budget des départements donnés (lien B de la navette). */
export async function listReleasedBudgetAdvances(churchId: string, departmentIds: string[]) {
  if (departmentIds.length === 0) return [];
  const { prisma } = await import("@/lib/prisma");
  return prisma.financialPayment.findMany({
    where: {
      releasedAt: { not: null },
      request: { churchId, type: "BUDGET_ADVANCE", departmentId: { in: departmentIds } },
    },
    select: {
      id: true,
      releasedAt: true,
      releasedAmount: true,
      amount: true,
      request: { select: { id: true, label: true } },
    },
    orderBy: { releasedAt: "asc" },
  });
}

/** Notes de frais (non annulées) des départements donnés, avec leur première pièce (lien C). */
export async function listDepartmentExpenseReports(churchId: string, departmentIds: string[]) {
  if (departmentIds.length === 0) return [];
  const { prisma } = await import("@/lib/prisma");
  return prisma.financialRequest.findMany({
    where: {
      churchId,
      type: "EXPENSE_REPORT",
      departmentId: { in: departmentIds },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      label: true,
      description: true,
      amount: true,
      status: true,
      createdAt: true,
      submittedBy: { select: { id: true, name: true, email: true } },
      attachments: { select: { s3Key: true, filename: true, mimeType: true, size: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
}
