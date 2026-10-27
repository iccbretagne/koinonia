import { randomBytes } from "node:crypto";
import { ApiError } from "@/lib/api-utils";
import { CHURCH_LOGO_LABEL, CHURCH_LOGO_MAX_BYTES, type ChurchLogoVariant } from "../schemas";

/**
 * Logo de l'église dans l'interface (spec 072) : une image par fond, en base. Le fichier déposé
 * n'est jamais servi tel quel : seul le PNG préparé est gardé.
 *
 * Prisma, l'audit et sharp sont importés à la demande : le root layout importe l'index du module
 * à chaque rendu (spec 069), sans avoir besoin de ce service.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

const MAX_INPUT_PIXELS = 40_000_000;
const ACCEPTED_FORMATS = new Set(["png", "jpeg", "webp"]);
const FORMAT_HINT = "déposez un fichier PNG, JPEG ou WebP";
/** Deux fois la taille affichée (36 px de haut), pour les écrans haute densité et les logos larges. */
const MAX_WIDTH = 600;
const MAX_HEIGHT = 200;

export interface ChurchLogoActor {
  id: string;
}

/**
 * Contrôle et prépare un logo : 2 Mo au plus, format **décodé** PNG, JPEG ou WebP (un SVG ou un
 * GIF est refusé quel que soit son nom), orientation appliquée, réduit sans déformation,
 * réencodé en PNG sans métadonnées. Toute anomalie donne une erreur 400 lisible.
 */
export async function normalizeChurchLogo(buffer: Buffer): Promise<Buffer> {
  if (buffer.length > CHURCH_LOGO_MAX_BYTES) throw new ApiError(400, "Le logo dépasse 2 Mo.");
  const sharp = (await import("sharp")).default;
  let format: string | undefined;
  try {
    format = (await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new ApiError(400, `Ce fichier n'est pas une image lisible : ${FORMAT_HINT}.`);
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) throw new ApiError(400, `Format non accepté : ${FORMAT_HINT}.`);
  try {
    return await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    throw new ApiError(400, `L'image n'a pas pu être utilisée (fichier endommagé) : ${FORMAT_HINT}.`);
  }
}

async function audit(churchId: string, actor: ChurchLogoActor, variant: ChurchLogoVariant, logo: string) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({
    userId: actor.id,
    churchId,
    action: "UPDATE",
    entityType: "Church",
    entityId: churchId,
    details: { changedFields: ["logo"], logo: `Logo pour ${CHURCH_LOGO_LABEL[variant]} ${logo}` },
  });
}

/** Dépose ou remplace un logo ; renvoie sa nouvelle version. */
export async function setChurchLogo(
  churchId: string,
  variant: ChurchLogoVariant,
  buffer: Buffer,
  actor: ChurchLogoActor
): Promise<string> {
  const data = await normalizeChurchLogo(buffer);
  const prisma = await db();
  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true } });
  if (!church) throw new ApiError(404, "Église introuvable");
  const previous = await prisma.churchLogo.findUnique({
    where: { churchId_variant: { churchId, variant } },
    select: { version: true },
  });
  const version = randomBytes(6).toString("hex");
  const bytes = new Uint8Array(data);
  await prisma.churchLogo.upsert({
    where: { churchId_variant: { churchId, variant } },
    create: { churchId, variant, data: bytes, version, updatedById: actor.id },
    update: { data: bytes, version, updatedById: actor.id },
  });
  await audit(churchId, actor, variant, previous ? "remplacé" : "déposé");
  return version;
}

/** Retire un logo ; sans logo, rien n'est fait ni journalisé. */
export async function removeChurchLogo(churchId: string, variant: ChurchLogoVariant, actor: ChurchLogoActor) {
  const prisma = await db();
  const { count } = await prisma.churchLogo.deleteMany({ where: { churchId, variant } });
  if (count > 0) await audit(churchId, actor, variant, "retiré");
}

/** Octets du logo préparé, `null` sans logo. */
export async function getChurchLogo(churchId: string, variant: ChurchLogoVariant): Promise<Buffer | null> {
  const prisma = await db();
  const logo = await prisma.churchLogo.findUnique({
    where: { churchId_variant: { churchId, variant } },
    select: { data: true },
  });
  return logo ? Buffer.from(logo.data) : null;
}
