import { randomBytes } from "node:crypto";
import { ApiError } from "@/lib/api-utils";
import {
  APP_ICON_BADGE_VARIANT,
  APP_ICON_IMAGE_VARIANTS,
  APP_ICON_MAX_BYTES,
  APP_ICON_MIN_SIZE,
  DEFAULT_APP_ICON_PATHS,
  GENERIC_BADGE_PATH,
  type AppIconImageVariant,
  type AppIconVariantName,
} from "../schemas";

/**
 * Icône de l'application (spec 069) : réglage de plateforme, une seule icône pour toute
 * l'instance. Les variantes préparées vivent en base ; sans ligne, l'icône livrée s'applique.
 *
 * Prisma, l'audit et sharp sont importés à la demande : le root layout importe ce module (via
 * l'index) à chaque rendu pour lire la version, sans charger le reste.
 */

const MAX_INPUT_PIXELS = 40_000_000;
const ICON_FORMATS = new Set(["png", "jpeg", "webp"]);
const BADGE_FORMATS = new Set(["png", "webp"]);
/** Écart toléré entre largeur et hauteur pour une image « carrée ». */
const SQUARE_TOLERANCE = 0.02;
const VERSION_TTL_MS = 60_000;
const HISTORY_SIZE = 20;
const FORMAT_HINT = "déposez un fichier PNG, JPEG ou WebP";

export interface AppIconActor {
  id: string;
}

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

async function decode(buffer: Buffer, formats: Set<string>, hint: string) {
  const sharp = (await import("sharp")).default;
  if (buffer.length > APP_ICON_MAX_BYTES) throw new ApiError(400, "Le fichier dépasse 5 Mo.");
  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new ApiError(400, `Ce fichier n'est pas une image lisible : ${hint}.`);
  }
  if (!metadata.format || !formats.has(metadata.format)) {
    throw new ApiError(400, `Format non accepté : ${hint}.`);
  }
  return { sharp, metadata };
}

/** Réencode en PNG, orientation appliquée, métadonnées retirées ; image corrompue = 400. */
async function reencode(sharp: typeof import("sharp"), buffer: Buffer, hint: string): Promise<Buffer> {
  try {
    return await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate().png().toBuffer();
  } catch {
    throw new ApiError(400, `L'image n'a pas pu être utilisée (fichier endommagé) : ${hint}.`);
  }
}

/**
 * Contrôle une icône déposée : 5 Mo au plus (avant décodage), format **décodé** PNG, JPEG ou WebP
 * (un SVG ou un GIF est refusé quel que soit son nom), carrée à 2 % près, 512 px au moins.
 */
export async function normalizeAppIcon(buffer: Buffer): Promise<Buffer> {
  const { sharp, metadata } = await decode(buffer, ICON_FORMATS, FORMAT_HINT);
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (Math.abs(width - height) > Math.max(width, height) * SQUARE_TOLERANCE) {
    throw new ApiError(400, `L'image doit être carrée (reçu ${width} × ${height} px).`);
  }
  if (Math.min(width, height) < APP_ICON_MIN_SIZE) {
    throw new ApiError(
      400,
      `L'image est trop petite (${width} × ${height} px) : ${APP_ICON_MIN_SIZE} × ${APP_ICON_MIN_SIZE} px au moins, 1024 × 1024 conseillé.`
    );
  }
  return reencode(sharp, buffer, FORMAT_HINT);
}

/** Contrôle une silhouette de badge : PNG ou WebP **avec transparence**, 5 Mo au plus. */
export async function normalizeBadge(buffer: Buffer): Promise<Buffer> {
  const hint = "déposez un PNG ou WebP avec transparence";
  const { sharp, metadata } = await decode(buffer, BADGE_FORMATS, hint);
  if (!metadata.hasAlpha) {
    throw new ApiError(400, "La silhouette doit avoir un fond transparent (PNG ou WebP avec transparence).");
  }
  return reencode(sharp, buffer, hint);
}

const toDataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;

export interface AppIconPreview {
  background: string;
  variants: Partial<Record<AppIconImageVariant, string>>;
  badge: string | null;
}

/** Aperçu avant enregistrement, en data URL : rien n'est écrit. */
export async function previewAppIcon(input: {
  icon: Buffer | null;
  background?: string;
  badge?: Buffer | null;
}): Promise<AppIconPreview> {
  const render = await import("./app-icon-render");
  let background = input.background ?? null;
  let variants: AppIconPreview["variants"] = {};
  if (input.icon) {
    const png = await normalizeAppIcon(input.icon);
    background ??= render.rgbToHex(await render.suggestBackground(png));
    const rendered = await render.renderAppIconVariants(png, render.hexToRgb(background));
    variants = Object.fromEntries(Object.entries(rendered).map(([k, v]) => [k, toDataUrl(v)]));
  }
  const badge = input.badge ? toDataUrl(await render.renderBadge(await normalizeBadge(input.badge))) : null;
  return { background: background ?? "#ffffff", variants, badge };
}

// ─── Version (cache-busting) ─────────────────────────────────────────────────

let versionCache: { value: string; at: number } | null = null;

/** Version du jeu en vigueur, `"default"` sans icône déposée. Cache mémoire de 60 s. */
export async function getAppIconVersion(): Promise<string> {
  if (versionCache && Date.now() - versionCache.at < VERSION_TTL_MS) return versionCache.value;
  // Pré-rendu au build : pas de base, l'icône livrée suffit (la page est servie à la demande).
  if (process.env.NEXT_PHASE === "phase-production-build") return "default";
  let value: string;
  try {
    const prisma = await db();
    const row = await prisma.appIconVariant.findUnique({ where: { variant: "icon-192" }, select: { version: true } });
    value = row?.version ?? "default";
  } catch {
    // Base indisponible (build, démarrage) : l'icône livrée reste servie.
    return "default";
  }
  versionCache = { value, at: Date.now() };
  return value;
}

/** Réservé aux tests et aux écritures. */
export function resetAppIconVersionCache() {
  versionCache = null;
}

export function appIconUrl(variant: AppIconVariantName, version: string): string {
  return `/api/app-icon/${variant}.png?v=${version}`;
}

/** Fichier livré servi à défaut ; la cloche remplace le « K » sous une icône déposée. */
export function defaultAppIconPath(variant: AppIconVariantName, custom: boolean): string {
  if (variant === APP_ICON_BADGE_VARIANT && custom) return GENERIC_BADGE_PATH;
  return DEFAULT_APP_ICON_PATHS[variant];
}

export async function getAppIconVariant(
  variant: AppIconVariantName
): Promise<{ data: Uint8Array; version: string } | null> {
  const prisma = await db();
  return prisma.appIconVariant.findUnique({ where: { variant }, select: { data: true, version: true } });
}

// ─── État et écriture ────────────────────────────────────────────────────────

export interface AppIconState {
  custom: boolean;
  version: string;
  background: string | null;
  hasBadge: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  history: { id: string; action: string; target: string | null; author: string; createdAt: string }[];
}

export async function getAppIconState(): Promise<AppIconState> {
  const prisma = await db();
  const [rows, logs] = await Promise.all([
    prisma.appIconVariant.findMany({
      select: {
        variant: true,
        version: true,
        background: true,
        updatedAt: true,
        updatedBy: { select: { name: true, displayName: true, email: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { entityType: "AppIcon" },
      orderBy: { createdAt: "desc" },
      take: HISTORY_SIZE,
      select: {
        id: true,
        action: true,
        details: true,
        createdAt: true,
        user: { select: { name: true, displayName: true, email: true } },
      },
    }),
  ]);
  const icon = rows.find((r) => r.variant === "icon-192");
  const latest = [...rows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  const nameOf = (u: { name: string | null; displayName: string | null; email: string } | null) =>
    u ? (u.displayName ?? u.name ?? u.email) : "Compte supprimé";
  return {
    custom: Boolean(icon),
    version: icon?.version ?? "default",
    background: icon?.background ?? null,
    hasBadge: rows.some((r) => r.variant === APP_ICON_BADGE_VARIANT),
    updatedAt: latest ? latest.updatedAt.toISOString() : null,
    updatedBy: latest ? nameOf(latest.updatedBy) : null,
    history: logs.map((log) => ({
      id: log.id,
      action: log.action,
      target: ((log.details as { target?: string } | null)?.target as string | undefined) ?? null,
      author: nameOf(log.user),
      createdAt: log.createdAt.toISOString(),
    })),
  };
}

const newVersion = () => randomBytes(6).toString("hex");

async function audit(actor: AppIconActor, action: "CREATE" | "UPDATE" | "DELETE", details: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId: actor.id, action, entityType: "AppIcon", entityId: "app", details });
}

/**
 * Dépose ou remplace l'icône : les cinq variantes sont remplacées dans une transaction, avec une
 * nouvelle version partagée par la silhouette conservée. Le fichier déposé n'est pas gardé.
 */
export async function setAppIcon(buffer: Buffer, background: string, actor: AppIconActor): Promise<AppIconState> {
  const render = await import("./app-icon-render");
  const png = await normalizeAppIcon(buffer);
  let variants: Record<AppIconImageVariant, Buffer>;
  try {
    variants = await render.renderAppIconVariants(png, render.hexToRgb(background));
  } catch {
    throw new ApiError(400, "L'image n'a pas pu être utilisée : l'icône en vigueur est conservée.");
  }
  const version = newVersion();
  const prisma = await db();
  const existed = await prisma.$transaction(async (tx) => {
    const previous = await tx.appIconVariant.findUnique({ where: { variant: "icon-192" }, select: { version: true } });
    await Promise.all(
      APP_ICON_IMAGE_VARIANTS.map((variant) => {
        const data = Uint8Array.from(variants[variant]);
        return tx.appIconVariant.upsert({
          where: { variant },
          create: { variant, data, version, background, updatedById: actor.id },
          update: { data, version, background, updatedById: actor.id },
        });
      })
    );
    await tx.appIconVariant.updateMany({ where: { variant: APP_ICON_BADGE_VARIANT }, data: { version } });
    return previous !== null;
  });
  resetAppIconVersionCache();
  await audit(actor, existed ? "UPDATE" : "CREATE", { target: "icon", background });
  return getAppIconState();
}

/** Dépose ou remplace la silhouette des notifications ; exige une icône déposée. */
export async function setAppIconBadge(buffer: Buffer, actor: AppIconActor): Promise<AppIconState> {
  const render = await import("./app-icon-render");
  const badge = await render.renderBadge(await normalizeBadge(buffer));
  const version = newVersion();
  const prisma = await db();
  const existed = await prisma.$transaction(async (tx) => {
    const icon = await tx.appIconVariant.findUnique({ where: { variant: "icon-192" }, select: { background: true } });
    if (!icon) throw new ApiError(400, "Déposez d'abord une icône : la silhouette l'accompagne.");
    const previous = await tx.appIconVariant.findUnique({
      where: { variant: APP_ICON_BADGE_VARIANT },
      select: { version: true },
    });
    const data = Uint8Array.from(badge);
    await tx.appIconVariant.upsert({
      where: { variant: APP_ICON_BADGE_VARIANT },
      create: { variant: APP_ICON_BADGE_VARIANT, data, version, updatedById: actor.id },
      update: { data, version, updatedById: actor.id },
    });
    await tx.appIconVariant.updateMany({ where: { variant: { not: APP_ICON_BADGE_VARIANT } }, data: { version } });
    return previous !== null;
  });
  resetAppIconVersionCache();
  await audit(actor, existed ? "UPDATE" : "CREATE", { target: "badge" });
  return getAppIconState();
}

/**
 * Retire l'icône (retour au défaut, silhouette comprise) ou la seule silhouette (la cloche
 * générique la remplace). Sans effet ni journal s'il n'y a rien à retirer.
 */
export async function removeAppIcon(target: "icon" | "badge", actor: AppIconActor): Promise<AppIconState> {
  const prisma = await db();
  const removed = await prisma.$transaction(async (tx) => {
    if (target === "icon") return (await tx.appIconVariant.deleteMany({})).count;
    const { count } = await tx.appIconVariant.deleteMany({ where: { variant: APP_ICON_BADGE_VARIANT } });
    if (count > 0) await tx.appIconVariant.updateMany({ data: { version: newVersion() } });
    return count;
  });
  resetAppIconVersionCache();
  if (removed > 0) await audit(actor, "DELETE", { target });
  return getAppIconState();
}
