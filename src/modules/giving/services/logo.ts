import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ApiError } from "@/lib/api-utils";
import { logger } from "@/lib/logger";
import { deleteMediaFile, getS3ObjectStream, uploadFile } from "@/modules/storage";
import { defaultGivingContent } from "./defaults";
import { alertPaymentDetailsChange } from "./alerts";
import { givingLogoKey, logoVersionFromKey } from "./logo-keys";

/** Poids maximal du fichier déposé (spec 066). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const ACCEPTED_FORMATS = new Set(["png", "jpeg", "webp"]);

/**
 * Contrôle et réencode un logo déposé : format **décodé** limité à PNG, JPEG ou WebP (le type
 * déclaré n'est pas pris en compte, un SVG est donc refusé quel que soit son nom), orientation
 * appliquée, dimensions bornées, réencodage PNG qui garde la transparence et retire les
 * métadonnées. Toute anomalie donne une erreur 400 lisible.
 */
export async function normalizeLogo(buffer: Buffer): Promise<Buffer> {
  if (buffer.length > LOGO_MAX_BYTES) throw new ApiError(400, "Le logo dépasse 2 Mo.");
  let format: string | undefined;
  try {
    format = (await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new ApiError(400, "Image illisible : déposez un fichier PNG, JPEG ou WebP.");
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new ApiError(400, "Format non accepté : déposez un fichier PNG, JPEG ou WebP.");
  }
  try {
    const out = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: 1200, height: 600, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    // Copie vers un ArrayBuffer ordinaire, attendu par le SDK S3 (voir media/services/image.ts).
    return Buffer.from(new Uint8Array(out));
  } catch {
    throw new ApiError(400, "Image illisible : déposez un fichier PNG, JPEG ou WebP.");
  }
}

/**
 * Dépose, remplace (`buffer`) ou retire (`null`) le logo de la page de dons : seul point
 * d'écriture de `logoKey`. Nouvelle clé à chaque dépôt, ancienne supprimée après
 * l'enregistrement ; journal et alerte de la comptabilité comme un changement d'IBAN.
 * Renvoie la nouvelle version (`null` après un retrait).
 */
export async function setGivingLogo(
  churchId: string,
  buffer: Buffer | null,
  actor: { id: string; name: string }
): Promise<string | null> {
  const png = buffer ? await normalizeLogo(buffer) : null;
  const newKey = png ? givingLogoKey(churchId, randomUUID()) : null;
  if (png && newKey) await uploadFile(newKey, png, "image/png");

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const church = await tx.church.findUnique({
        where: { id: churchId },
        select: { id: true, name: true, accountingEmails: true, givingPage: { select: { logoKey: true } } },
      });
      if (!church) throw new ApiError(404, "Église introuvable");
      const page = await tx.givingPage.upsert({
        where: { churchId },
        create: { churchId, ...defaultGivingContent(church.name), logoKey: newKey, updatedById: actor.id },
        update: { logoKey: newKey, updatedById: actor.id },
        select: { id: true },
      });
      return { church, pageId: page.id, oldKey: church.givingPage?.logoKey ?? null };
    });
  } catch (error) {
    if (newKey) await deleteMediaFile(newKey).catch(() => {});
    throw error;
  }

  const { church, pageId, oldKey } = result;
  if (oldKey && oldKey !== newKey) {
    await deleteMediaFile(oldKey).catch((err) =>
      logger.error({ err, churchId, key: oldKey }, "Ancien logo de la page de dons non supprimé")
    );
  }
  if (oldKey === newKey) return logoVersionFromKey(newKey);

  const after = newKey ? (oldKey ? "remplacé" : "déposé") : "retiré";
  await logAudit({
    userId: actor.id,
    churchId,
    action: "UPDATE",
    entityType: "GivingPage",
    entityId: pageId,
    details: { changedFields: ["logoKey"], logo: after, alerted: ["Logo"] },
  });
  await alertPaymentDetailsChange(
    church,
    [{ label: "Logo", before: oldKey ? "présent" : "aucun", after }],
    actor
  );
  return logoVersionFromKey(newKey);
}

/** Logo d'une église pour le paramétrage (page active ou non), `null` sans logo. */
export async function getGivingLogoStream(churchId: string): Promise<Readable | null> {
  const page = await prisma.givingPage.findUnique({ where: { churchId }, select: { logoKey: true } });
  return page?.logoKey ? getS3ObjectStream(page.logoKey) : null;
}

/** Logo public : `null` si l'église est inconnue, la page inactive ou sans logo. */
export async function getPublicGivingLogoStream(slug: string): Promise<Readable | null> {
  const church = await prisma.church.findUnique({
    where: { slug },
    select: { givingPage: { select: { enabled: true, logoKey: true } } },
  });
  const page = church?.givingPage;
  return page?.enabled && page.logoKey ? getS3ObjectStream(page.logoKey) : null;
}
