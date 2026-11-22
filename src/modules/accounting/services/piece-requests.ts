import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api-utils";

/**
 * « Demander une pièce » (spec 086) : la compta demande une pièce sur une demande financière ; le
 * demandeur seul peut alors la déposer, par lot, quel que soit l'état de la demande (hors annulée
 * ou rejetée). Le premier lot referme l'état et prévient la compta une fois. La route
 * `POST /api/accounting/attachments` (règle « Soumise ») reste inchangée.
 */

export const PIECE_MAX_FILES = 10;
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const CLOSED = ["CANCELLED", "REJECTED"];

export interface PieceActor {
  id: string;
  name: string;
}

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

async function audit(churchId: string, userId: string, requestId: string, details: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId, action: "UPDATE", entityType: "FinancialRequest", entityId: requestId, details });
}

async function load(requestId: string) {
  const prisma = await db();
  const req = await prisma.financialRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new ApiError(404, "Demande introuvable");
  return req;
}

/** Pose ou rafraîchit la demande de pièce ; prévient le demandeur (cloche, email, appareils). */
export async function requestPiece(requestId: string, actor: PieceActor, note?: string, now = new Date()) {
  const req = await load(requestId);
  if (CLOSED.includes(req.status)) throw new ApiError(400, "Cette demande est annulée ou rejetée");
  const prisma = await db();
  const member = await prisma.userChurchRole.count({ where: { userId: req.submittedById, churchId: req.churchId } });
  if (member === 0) throw new ApiError(400, "Le demandeur n'a plus de compte actif dans l'église");

  const cleanNote = note?.trim() || null;
  const reminder = req.pieceRequestedAt !== null;
  const updated = await prisma.financialRequest.update({
    where: { id: requestId },
    data: {
      pieceRequestedAt: req.pieceRequestedAt ?? now,
      pieceRequestLastAt: now,
      pieceRequestCount: { increment: 1 },
      pieceRequestNote: cleanNote,
    },
  });
  await audit(req.churchId, actor.id, requestId, { pieceRequest: reminder ? "reminder" : "request", note: cleanNote });

  const { createNotification } = await import("@/lib/notifications");
  await createNotification({
    userId: req.submittedById,
    domain: "accounting",
    type: "ACCOUNTING_PIECE_REQUESTED",
    title: reminder ? "Pièce demandée (relance)" : "Pièce demandée",
    message: `La comptabilité demande une pièce pour « ${req.label} »${cleanNote ? ` : ${cleanNote}` : "."}`,
    link: `/accounting/requests/${requestId}`,
  });
  return updated;
}

/** Retire la mention (pièce reçue autrement). */
export async function cancelPieceRequest(requestId: string, actor: PieceActor) {
  const req = await load(requestId);
  if (!req.pieceRequestedAt) throw new ApiError(400, "Aucune pièce n'est demandée");
  const prisma = await db();
  const updated = await prisma.financialRequest.update({ where: { id: requestId }, data: resetData() });
  await audit(req.churchId, actor.id, requestId, { pieceRequest: "cancelled", previousNote: req.pieceRequestNote });
  return updated;
}

function resetData() {
  return { pieceRequestedAt: null, pieceRequestLastAt: null, pieceRequestCount: 0, pieceRequestNote: null };
}

/** Comptables de l'église, plus ses adresses institutionnelles (sans compte, liste blanche). */
async function notifyAccounting(churchId: string, req: { id: string; label: string }, who: string, count: number) {
  const prisma = await db();
  const { notifyUsers } = await import("@/lib/notifications");
  const { sendEmail, buildGenericNotificationEmail, parseEmailList } = await import("@/lib/email");
  const [church, accountants] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId }, select: { accountingEmails: true } }),
    prisma.userChurchRole.findMany({ where: { churchId, role: "ACCOUNTANT" }, select: { userId: true } }),
  ]);
  const content = {
    title: "Nouvelle pièce sur une demande",
    message: `${who} a déposé ${count} pièce${count > 1 ? "s" : ""} sur « ${req.label} ».`,
    link: `/accounting/requests/${req.id}`,
  };
  const emails = parseEmailList(church?.accountingEmails);
  if (emails.length > 0) {
    sendEmail({ to: emails, ...buildGenericNotificationEmail(content) }).catch((err) =>
      console.error("[accounting] sendEmail to accountingEmails failed:", err?.message ?? err)
    );
  }
  await notifyUsers([...new Set(accountants.map((a) => a.userId))], {
    domain: "accounting",
    type: "ACCOUNTING_PIECE_SUBMITTED",
    ...content,
  });
}

/**
 * Dépôt par lot du demandeur. L'état est refermé dans la même transaction que les pièces, par une
 * prise conditionnelle : un double envoi ne notifie qu'une fois.
 */
/** Église d'une demande, `null` si elle n'existe pas (garde de la route de dépôt). */
export async function getRequestChurchId(requestId: string): Promise<string | null> {
  const row = await (await db()).financialRequest.findUnique({ where: { id: requestId }, select: { churchId: true } });
  return row?.churchId ?? null;
}

export async function submitPieces(requestId: string, actor: PieceActor, files: File[]) {
  const req = await load(requestId);
  if (req.submittedById !== actor.id) throw new ApiError(403, "Accès refusé");
  if (CLOSED.includes(req.status) || !req.pieceRequestedAt) throw new ApiError(400, "Aucune pièce n'est demandée");
  if (files.length === 0) throw new ApiError(400, "Fichier manquant");
  if (files.length > PIECE_MAX_FILES) throw new ApiError(400, `${PIECE_MAX_FILES} fichiers au plus`);
  for (const f of files) {
    if (!ALLOWED_TYPES.has(f.type)) throw new ApiError(400, "Format non supporté (JPEG, PNG, PDF uniquement)");
    if (f.size === 0 || f.size > MAX_SIZE) throw new ApiError(400, "Fichier vide ou trop volumineux (max 5 Mo)");
  }

  const { storeFile, deleteFile } = await import("@/lib/file-storage");
  const stored: { s3Key: string; file: File }[] = [];
  const prisma = await db();
  try {
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const s3Key = `accounting/${req.churchId}/${Date.now()}-${randomUUID()}.${ext}`;
      await storeFile(s3Key, Buffer.from(new Uint8Array(await file.arrayBuffer())), file.type);
      stored.push({ s3Key, file });
    }
    await prisma.$transaction(async (tx) => {
      const taken = await tx.financialRequest.updateMany({
        where: { id: requestId, pieceRequestedAt: { not: null } },
        data: resetData(),
      });
      if (taken.count === 0) throw new ApiError(400, "Aucune pièce n'est demandée");
      await tx.financialAttachment.createMany({
        data: stored.map(({ s3Key, file }) => ({
          requestId,
          uploadedById: actor.id,
          churchId: req.churchId,
          s3Key,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        })),
      });
    });
  } catch (error) {
    await Promise.all(stored.map((s) => deleteFile(s.s3Key).catch(() => {})));
    throw error;
  }

  await audit(req.churchId, actor.id, requestId, { pieceRequest: "submitted", files: stored.map((s) => s.file.name) });
  await notifyAccounting(req.churchId, req, actor.name, stored.length);
  return { count: stored.length };
}
