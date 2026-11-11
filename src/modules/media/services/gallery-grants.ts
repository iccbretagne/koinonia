import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

/**
 * Accès nominatifs à la galerie médias (spec 080) : lecture et téléchargement, sans partage,
 * avec une date de fin facultative évaluée à la lecture. Donnés et retirés par un Admin ou un
 * Ministre d'un ministère qui porte une équipe média (garde côté route).
 */

export interface GalleryGrantView {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  expiresAt: string | null;
  expired: boolean;
  grantedBy: string | null;
  createdAt: string;
}

const grantSelect = {
  id: true,
  userId: true,
  expiresAt: true,
  createdAt: true,
  user: { select: { name: true, displayName: true, email: true } },
  grantedBy: { select: { name: true, displayName: true } },
} as const;

type GrantRow = {
  id: string;
  userId: string;
  expiresAt: Date | null;
  createdAt: Date;
  user: { name: string | null; displayName: string | null; email: string | null };
  grantedBy: { name: string | null; displayName: string | null } | null;
};

function toView(g: GrantRow, now = new Date()): GalleryGrantView {
  return {
    id: g.id,
    userId: g.userId,
    name: g.user.displayName ?? g.user.name,
    email: g.user.email,
    expiresAt: g.expiresAt?.toISOString() ?? null,
    expired: g.expiresAt !== null && g.expiresAt <= now,
    grantedBy: g.grantedBy ? (g.grantedBy.displayName ?? g.grantedBy.name) : null,
    createdAt: g.createdAt.toISOString(),
  };
}

export async function listGalleryGrants(churchId: string): Promise<GalleryGrantView[]> {
  const grants = await prisma.mediaGalleryGrant.findMany({
    where: { churchId },
    orderBy: { createdAt: "desc" },
    select: grantSelect,
  });
  return grants.map((g) => toView(g));
}

function assertFuture(expiresAt: Date | null) {
  if (expiresAt && expiresAt <= new Date()) throw new ApiError(400, "La date de fin doit être dans le futur");
}

/**
 * Donne (ou prolonge) l'accès d'un compte de l'église. Le compte doit avoir un rôle dans cette
 * église. La personne est notifiée à la création de l'accès, pas à une simple prolongation.
 */
export async function upsertGalleryGrant(
  churchId: string,
  actorId: string,
  input: { userId: string; expiresAt: Date | null }
): Promise<GalleryGrantView> {
  assertFuture(input.expiresAt);
  const member = await prisma.userChurchRole.findFirst({
    where: { churchId, userId: input.userId },
    select: { id: true },
  });
  if (!member) throw new ApiError(400, "Ce compte n'a aucun rôle dans cette église");

  const existing = await prisma.mediaGalleryGrant.findUnique({
    where: { churchId_userId: { churchId, userId: input.userId } },
    select: { id: true, expiresAt: true },
  });
  const grant = await prisma.mediaGalleryGrant.upsert({
    where: { churchId_userId: { churchId, userId: input.userId } },
    create: { churchId, userId: input.userId, grantedById: actorId, expiresAt: input.expiresAt },
    update: { grantedById: actorId, expiresAt: input.expiresAt },
    select: grantSelect,
  });

  await logAudit({
    userId: actorId,
    churchId,
    action: existing ? "UPDATE" : "CREATE",
    entityType: "MediaGalleryGrant",
    entityId: grant.id,
    details: {
      userId: input.userId,
      expiresAt: input.expiresAt?.toISOString() ?? null,
      ...(existing ? { previousExpiresAt: existing.expiresAt?.toISOString() ?? null } : {}),
    },
  });

  // Un accès expiré puis renouvelé est une nouvelle ouverture : la personne est prévenue.
  const wasActive = existing && (existing.expiresAt === null || existing.expiresAt > new Date());
  if (!wasActive) {
    const { createNotification } = await import("@/lib/notifications");
    await createNotification({
      userId: input.userId,
      domain: "media",
      type: "MEDIA_GALLERY_GRANTED",
      title: "Accès à la galerie médias",
      message: input.expiresAt
        ? `Vous pouvez parcourir et télécharger les photos et visuels de l'église jusqu'au ${input.expiresAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}.`
        : "Vous pouvez parcourir et télécharger les photos et visuels de l'église.",
      link: "/media/galerie",
    });
  }

  return toView(grant);
}

async function findGrant(churchId: string, id: string) {
  const grant = await prisma.mediaGalleryGrant.findFirst({ where: { id, churchId }, select: { id: true, userId: true, expiresAt: true } });
  if (!grant) throw new ApiError(404, "Accès introuvable");
  return grant;
}

export async function updateGalleryGrant(
  churchId: string,
  actorId: string,
  id: string,
  expiresAt: Date | null
): Promise<GalleryGrantView> {
  assertFuture(expiresAt);
  const before = await findGrant(churchId, id);
  const grant = await prisma.mediaGalleryGrant.update({ where: { id }, data: { expiresAt }, select: grantSelect });
  await logAudit({
    userId: actorId,
    churchId,
    action: "UPDATE",
    entityType: "MediaGalleryGrant",
    entityId: id,
    details: { userId: before.userId, expiresAt: expiresAt?.toISOString() ?? null, previousExpiresAt: before.expiresAt?.toISOString() ?? null },
  });
  return toView(grant);
}

export async function deleteGalleryGrant(churchId: string, actorId: string, id: string): Promise<void> {
  const before = await findGrant(churchId, id);
  await prisma.mediaGalleryGrant.delete({ where: { id } });
  await logAudit({
    userId: actorId,
    churchId,
    action: "DELETE",
    entityType: "MediaGalleryGrant",
    entityId: id,
    details: { userId: before.userId, expiresAt: before.expiresAt?.toISOString() ?? null },
  });
}

/** Comptes de l'église proposés à l'ajout d'un accès (recherche par nom ou email). */
export async function searchChurchUsersForGrant(churchId: string, q: string) {
  const users = await prisma.user.findMany({
    where: {
      churchRoles: { some: { churchId } },
      OR: [{ name: { contains: q } }, { displayName: { contains: q } }, { email: { contains: q } }],
    },
    take: 10,
    orderBy: { name: "asc" },
    select: { id: true, name: true, displayName: true, email: true },
  });
  return users.map((u) => ({ id: u.id, name: u.displayName ?? u.name, email: u.email }));
}
