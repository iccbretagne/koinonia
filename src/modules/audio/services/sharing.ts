/**
 * Partage de bibliothèque audio entre églises (spec 036) — octroi dirigé et unilatéral :
 * `ownerChurchId` ouvre sa bibliothèque publiée à `guestChurchId`, sans hiérarchie ni
 * réciprocité automatique. L'identifiant public utilisé pour nouer un partage est
 * `Church.slug` (déjà unique) — jamais l'ID interne, jamais une liste d'églises proposée.
 */
import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";

type DbClient = Prisma.TransactionClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export interface AccessibleLibraryChurch {
  id: string;
  name: string;
  primaryColor: string;
}

/**
 * Liste des églises dont la bibliothèque publiée est accessible à `churchId` : l'église
 * elle-même, plus les propriétaires qui la lui ont ouverte. Fonction pivot — tout le reste
 * de la bibliothèque partagée en dépend. Un partage **sortant** (churchId a ouvert sa
 * bibliothèque à une autre) ne donne rien en retour : la relation n'est pas réciproque.
 */
export async function listAccessibleLibraryChurchIds(churchId: string, db?: DbClient): Promise<string[]> {
  db ??= await defaultDb();

  const incoming = await db.audioLibraryShare.findMany({
    where: { guestChurchId: churchId },
    select: { ownerChurchId: true },
  });

  return [churchId, ...incoming.map((s) => s.ownerChurchId)];
}

/** Même périmètre que `listAccessibleLibraryChurchIds`, enrichi pour le filtre et les badges d'origine. */
export async function listAccessibleLibraryChurches(churchId: string, db?: DbClient): Promise<AccessibleLibraryChurch[]> {
  db ??= await defaultDb();

  const churchIds = await listAccessibleLibraryChurchIds(churchId, db);
  const churches = await db.church.findMany({
    where: { id: { in: churchIds } },
    select: { id: true, name: true, primaryColor: true },
  });

  // Préserve l'ordre : l'église elle-même en premier, puis les propriétaires ayant partagé.
  return churchIds
    .map((id) => churches.find((c) => c.id === id))
    .filter((c): c is AccessibleLibraryChurch => c !== undefined);
}

export interface OutgoingShare {
  id: string;
  churchId: string;
  churchName: string;
  churchSlug: string;
  createdAt: Date;
}

/** Écran d'administration — les églises auxquelles `ownerChurchId` a ouvert sa bibliothèque. */
export async function listOutgoingShares(ownerChurchId: string, db?: DbClient): Promise<OutgoingShare[]> {
  db ??= await defaultDb();

  const shares = await db.audioLibraryShare.findMany({
    where: { ownerChurchId },
    include: { guestChurch: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  return shares.map((s) => ({
    id: s.id,
    churchId: s.guestChurch.id,
    churchName: s.guestChurch.name,
    churchSlug: s.guestChurch.slug,
    createdAt: s.createdAt,
  }));
}

export interface GrantLibraryShareResult {
  churchId: string;
  churchName: string;
  shareId?: string;
  createdAt?: Date;
}

/**
 * Résout un identifiant (slug) saisi par l'église propriétaire et, sauf `confirmOnly`, crée
 * le partage. Le POST en deux temps (plan.md) : `confirmOnly: true` résout sans créer et
 * retourne le nom pour vérification ; `confirmOnly: false` (par défaut) crée.
 * Rejette : slug inconnu, slug de sa propre église, partage déjà existant.
 */
export async function grantLibraryShare(
  ownerChurchId: string,
  slug: string,
  options: { confirmOnly: boolean },
  db?: DbClient
): Promise<GrantLibraryShareResult> {
  db ??= await defaultDb();

  const guestChurch = await db.church.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!guestChurch) throw new ApiError(404, "Identifiant inconnu, vérifiez-le auprès de l'église concernée");
  if (guestChurch.id === ownerChurchId) throw new ApiError(400, "Une église ne peut pas ouvrir sa bibliothèque à elle-même");

  if (options.confirmOnly) {
    return { churchId: guestChurch.id, churchName: guestChurch.name };
  }

  const existing = await db.audioLibraryShare.findUnique({
    where: { ownerChurchId_guestChurchId: { ownerChurchId, guestChurchId: guestChurch.id } },
  });
  if (existing) throw new ApiError(409, "Cette église a déjà accès à votre bibliothèque");

  const share = await db.audioLibraryShare.create({
    data: { ownerChurchId, guestChurchId: guestChurch.id },
  });

  return { churchId: guestChurch.id, churchName: guestChurch.name, shareId: share.id, createdAt: share.createdAt };
}

/** Révoque un partage — vérifie qu'il appartient bien à `ownerChurchId` avant suppression. */
export async function revokeLibraryShare(ownerChurchId: string, shareId: string, db?: DbClient): Promise<void> {
  db ??= await defaultDb();

  const share = await db.audioLibraryShare.findUnique({ where: { id: shareId } });
  if (!share || share.ownerChurchId !== ownerChurchId) throw new ApiError(404, "Partage introuvable");

  await db.audioLibraryShare.delete({ where: { id: shareId } });
}
