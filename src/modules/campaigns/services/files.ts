import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logger } from "@/lib/logger";
import { FILE_ACCEPT, FILE_REQUEST_MAX_FILES } from "../schemas";
import { assertEditable, type AssignmentAccess } from "../auth";
import { itemIndex } from "./definition";
import { CAMPAIGN_FILE_MAX_BYTES, sniffCampaignFile } from "./sniff";
import { auditCampaign, formSections } from "./assignments";

/**
 * Fichiers des demandes de fichier (spec 090) : stockage privé, type vérifié sur le contenu
 * (`sniffCampaignFile`), jamais lus au-delà, servis par Koinonia après revérification des droits.
 * Le journal ne porte ni nom de fichier ni contenu.
 */

const FILE_NOT_FOUND = "Fichier introuvable";

export interface CampaignFileView {
  id: string;
  requestCode: string;
  name: string;
  mime: string;
  size: number;
  uploadedAt: Date;
  uploadedByName: string | null;
}

const FILE_SELECT = {
  id: true,
  requestCode: true,
  name: true,
  mime: true,
  size: true,
  uploadedAt: true,
  uploadedByName: true,
} as const;

/**
 * Dépôt et retrait : répondant tant que la saisie est ouverte ; gestionnaire tant que la
 * campagne n'est pas clôturée (correction à sa place).
 */
function assertCanChangeFiles(access: AssignmentAccess) {
  if (access.role === "manager") {
    if (access.assignment.campaignStatus === "CLOSED") throw new ApiError(409, "La campagne est clôturée");
    return;
  }
  assertEditable(access.assignment);
}

/** Nom affiché : caractères sûrs seulement, 200 au plus (comme les justificatifs de la navette). */
export function cleanFileName(name: string, ext: string): string {
  const base = (name || `fichier.${ext}`).replace(/[^\p{L}\p{N}._ -]/gu, "_").trim();
  return (base || `fichier.${ext}`).slice(0, 200);
}

export async function storeCampaignFile(access: AssignmentAccess, requestCode: string, file: File): Promise<CampaignFileView> {
  assertCanChangeFiles(access);
  const { assignment } = access;

  const form = await prisma.campaignForm.findUnique({ where: { id: assignment.formId }, select: { definition: true } });
  const item = form ? itemIndex(formSections(form.definition).sections).get(requestCode) : undefined;
  if (!item || item.type !== "file_request") throw new ApiError(400, "Cette question n'attend pas de fichier");

  if (file.size === 0) throw new ApiError(400, "Fichier vide");
  if (file.size > CAMPAIGN_FILE_MAX_BYTES) throw new ApiError(400, "Le fichier dépasse 10 Mo");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = await sniffCampaignFile(bytes, file.name);
  if (!sniffed) throw new ApiError(400, "Fichier refusé : classeur XLSX sans macro, CSV ou PDF uniquement");
  const accept = item.accept ?? FILE_ACCEPT;
  if (!accept.includes(sniffed.ext)) {
    throw new ApiError(400, `Type non accepté pour cette demande : ${accept.map((e) => e.toUpperCase()).join(", ")}`);
  }

  const maxFiles = item.maxFiles ?? FILE_REQUEST_MAX_FILES;
  const count = await prisma.campaignFile.count({ where: { assignmentId: assignment.id, requestCode } });
  if (count >= maxFiles) throw new ApiError(409, `${maxFiles} fichier(s) au plus pour cette demande : retirez-en un d'abord`);

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `campaigns/${assignment.churchId}/${assignment.campaignId}/${assignment.id}/${randomUUID()}.${sniffed.ext}`;
  const { storeFile, deleteFile } = await import("@/lib/file-storage");
  await storeFile(storageKey, Buffer.from(bytes), sniffed.mime);

  let created: CampaignFileView;
  try {
    created = await prisma.$transaction(async (tx) => {
      const row = await tx.campaignFile.create({
        data: {
          assignmentId: assignment.id,
          campaignId: assignment.campaignId,
          churchId: assignment.churchId,
          requestCode,
          storageKey,
          name: cleanFileName(file.name, sniffed.ext),
          mime: sniffed.mime,
          size: bytes.length,
          sha256,
          uploadedById: access.actor.kind === "user" ? access.actor.userId : null,
          uploadedByName: access.actor.name.slice(0, 150),
        },
        select: FILE_SELECT,
      });
      // Premier dépôt sans état choisi : « fichier transmis ».
      const answer = await tx.campaignAnswer.findUnique({
        where: { assignmentId_code: { assignmentId: assignment.id, code: requestCode } },
        select: { value: true },
      });
      if (!answer || answer.value === null) {
        const data = {
          value: { status: "FILE_SENT" },
          qualifier: "EXACT" as const,
          updatedById: access.actor.kind === "user" ? access.actor.userId : null,
          updatedByName: access.actor.name.slice(0, 150),
        };
        await tx.campaignAnswer.upsert({
          where: { assignmentId_code: { assignmentId: assignment.id, code: requestCode } },
          create: { assignmentId: assignment.id, code: requestCode, ...data },
          update: data,
        });
      }
      return row;
    });
  } catch (error) {
    await deleteFile(storageKey).catch(() => logger.error("Campagne : objet orphelin non supprimé"));
    throw error;
  }

  await auditCampaign(access, "CREATE", "CampaignFile", created.id, {
    assignmentId: assignment.id,
    requestCode,
    mime: sniffed.mime,
    size: bytes.length,
  });
  return created;
}

/** Affectation d'un fichier, pour résoudre la garde avant tout accès ; null s'il n'existe pas. */
export async function getFileAssignmentId(fileId: string): Promise<string | null> {
  const file = await prisma.campaignFile.findUnique({ where: { id: fileId }, select: { assignmentId: true } });
  return file?.assignmentId ?? null;
}

async function findFile(access: AssignmentAccess, fileId: string) {
  const file = await prisma.campaignFile.findUnique({
    where: { id: fileId },
    select: { ...FILE_SELECT, assignmentId: true, storageKey: true },
  });
  // Fichier d'une autre affectation (autre lien, autre questionnaire) : même réponse qu'absent.
  if (!file || file.assignmentId !== access.assignment.id) throw new ApiError(404, FILE_NOT_FOUND);
  return file;
}

/** Contenu d'un fichier, droits déjà vérifiés pour l'affectation ; journalisé. */
export async function readCampaignFile(access: AssignmentAccess, fileId: string) {
  const file = await findFile(access, fileId);
  const { readStoredFile } = await import("@/lib/file-storage");
  const buffer = await readStoredFile(file.storageKey);
  if (!buffer) throw new ApiError(404, FILE_NOT_FOUND);
  await auditCampaign(access, "VIEW", "CampaignFile", file.id, { assignmentId: file.assignmentId, requestCode: file.requestCode });
  return { buffer, name: file.name, mime: file.mime, size: file.size };
}

export async function deleteCampaignFile(access: AssignmentAccess, fileId: string) {
  assertCanChangeFiles(access);
  const file = await findFile(access, fileId);
  await prisma.campaignFile.delete({ where: { id: file.id } });
  const { deleteFile } = await import("@/lib/file-storage");
  await deleteFile(file.storageKey).catch(() => logger.error("Campagne : objet supprimé de la base, pas du stockage"));
  await auditCampaign(access, "DELETE", "CampaignFile", file.id, { assignmentId: file.assignmentId, requestCode: file.requestCode });
  return { deleted: true as const };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Purge (tâche cron `campaigns`) : campagnes clôturées depuis plus de `fileRetentionDays` jours
 * et pas encore purgées depuis cette clôture ⇒ objets et lignes supprimés, `filesPurgedAt` posé.
 * Une campagne rouverte puis reclôturée est purgée de nouveau. Renvoie le nombre de fichiers.
 */
export async function purgeExpiredFiles(now: Date = new Date()): Promise<number> {
  const closed = await prisma.campaign.findMany({
    where: { status: "CLOSED", closedAt: { not: null } },
    select: { id: true, closedAt: true, fileRetentionDays: true, filesPurgedAt: true },
  });
  const due = closed.filter(
    (c) =>
      c.closedAt &&
      c.closedAt.getTime() + c.fileRetentionDays * DAY_MS <= now.getTime() &&
      (!c.filesPurgedAt || c.filesPurgedAt < c.closedAt)
  );
  if (due.length === 0) return 0;

  const { deleteFile } = await import("@/lib/file-storage");
  let purged = 0;
  for (const campaign of due) {
    const files = await prisma.campaignFile.findMany({ where: { campaignId: campaign.id }, select: { id: true, storageKey: true } });
    const removed: string[] = [];
    for (const f of files) {
      try {
        await deleteFile(f.storageKey);
        removed.push(f.id);
      } catch {
        logger.error("Campagne : purge d'un fichier échouée, nouvel essai au prochain passage");
      }
    }
    if (removed.length > 0) await prisma.campaignFile.deleteMany({ where: { id: { in: removed } } });
    purged += removed.length;
    // Tous retirés : purge terminée ; sinon la campagne sera reprise au prochain passage.
    if (removed.length === files.length) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { filesPurgedAt: now } });
    }
  }
  return purged;
}
