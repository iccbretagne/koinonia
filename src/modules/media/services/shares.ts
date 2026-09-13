import { ApiError } from "@/lib/api-utils";
import type { Session } from "next-auth";
import type { MediaShareToken } from "@/generated/prisma/client";
import { getTokenUrlPath } from "./tokens";

async function defaultDb() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export interface ShareScope {
  photos: boolean;
  visuels: boolean;
}

export interface ShareSource {
  type: "event" | "project";
  id: string;
  name: string;
}

export interface ActiveShare {
  id: string;
  type: MediaShareToken["type"];
  label: string | null;
  url: string;
  expiresAt: Date | null;
  createdAt: Date;
  usageCount: number;
  sources: ShareSource[];
  /** L'appelant peut-il révoquer ce lien avec son propre périmètre ? */
  canRevoke: boolean;
}

type ShareWithRelations = MediaShareToken & {
  mediaEvent: { id: string; name: string } | null;
  mediaProject: { id: string; name: string } | null;
};

interface CollectionConfigShape {
  eventIds?: string[];
  projectIds?: string[];
}

/**
 * Un lien de partage n'est visible/révocable que si TOUTES ses sources sont couvertes par le
 * périmètre demandé — une collection mixte (photos + visuels) reste masquée à une équipe qui
 * n'a que l'un des deux (spec 049 : "le partage est limité au périmètre de la personne").
 */
function isWithinScope(share: ShareWithRelations, scope: ShareScope): boolean {
  if (share.mediaEventId) return scope.photos;
  if (share.mediaProjectId) return scope.visuels;
  const config = share.config as CollectionConfigShape | null;
  const hasEvents = (config?.eventIds?.length ?? 0) > 0;
  const hasProjects = (config?.projectIds?.length ?? 0) > 0;
  return (!hasEvents || scope.photos) && (!hasProjects || scope.visuels);
}

function isActive(share: Pick<MediaShareToken, "expiresAt">, now: Date): boolean {
  return !share.expiresAt || share.expiresAt > now;
}

async function resolveSources(
  share: ShareWithRelations,
  db: Awaited<ReturnType<typeof defaultDb>>
): Promise<ShareSource[]> {
  if (share.mediaEvent) return [{ type: "event", id: share.mediaEvent.id, name: share.mediaEvent.name }];
  if (share.mediaProject) return [{ type: "project", id: share.mediaProject.id, name: share.mediaProject.name }];

  const config = share.config as CollectionConfigShape | null;
  const eventIds = config?.eventIds ?? [];
  const projectIds = config?.projectIds ?? [];
  const sources: ShareSource[] = [];

  if (eventIds.length > 0) {
    const events = await db.mediaEvent.findMany({ where: { id: { in: eventIds } }, select: { id: true, name: true } });
    sources.push(...events.map((e) => ({ type: "event" as const, id: e.id, name: e.name })));
  }
  if (projectIds.length > 0) {
    const projects = await db.mediaProject.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } });
    sources.push(...projects.map((p) => ({ type: "project" as const, id: p.id, name: p.name })));
  }
  return sources;
}

/** Liste les partages actifs d'une église, filtrés au périmètre de l'appelant (spec 049). */
export async function listActiveShares(churchId: string, scope: ShareScope): Promise<ActiveShare[]> {
  const db = await defaultDb();
  const now = new Date();

  const shares = await db.mediaShareToken.findMany({
    where: { churchId },
    include: {
      mediaEvent: { select: { id: true, name: true } },
      mediaProject: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const visible = shares.filter((s) => isActive(s, now) && isWithinScope(s, scope));
  const baseUrl = process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  return Promise.all(
    visible.map(async (s) => ({
      id: s.id,
      type: s.type,
      label: s.label,
      url: `${baseUrl}/media/${getTokenUrlPath(s.type)}/${s.token}`,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      usageCount: s.usageCount,
      sources: await resolveSources(s, db),
      canRevoke: isWithinScope(s, scope),
    }))
  );
}

/** Compte les partages actifs visibles dans le périmètre de l'appelant — pour le bouton « Partages ». */
export async function countActiveShares(churchId: string, scope: ShareScope): Promise<number> {
  const db = await defaultDb();
  const now = new Date();
  const shares = await db.mediaShareToken.findMany({
    where: { churchId },
    select: { expiresAt: true, mediaEventId: true, mediaProjectId: true, config: true },
  });
  return shares.filter(
    (s) =>
      isActive(s as Pick<MediaShareToken, "expiresAt">, now) &&
      isWithinScope({ ...s, mediaEvent: null, mediaProject: null } as ShareWithRelations, scope)
  ).length;
}

/**
 * Révoque un lien de partage — le périmètre requis est celui qui couvre TOUTES ses sources
 * (une collection mixte exige `media:manage`/équipe des deux activités), en réutilisant
 * `requireMediaManageAccess` pour ne pas dupliquer la logique de droits.
 */
export async function revokeShare(id: string, session: Session): Promise<void> {
  const db = await defaultDb();
  const { requireMediaManageAccess } = await import("@/lib/auth");
  const { logAudit } = await import("@/lib/audit");

  const share = await db.mediaShareToken.findUnique({
    where: { id },
    include: {
      mediaEvent: { select: { id: true, name: true, churchId: true } },
      mediaProject: { select: { id: true, name: true, churchId: true } },
    },
  });
  if (!share) throw new ApiError(404, "Lien de partage introuvable");

  const churchId = share.mediaEvent?.churchId ?? share.mediaProject?.churchId ?? share.churchId;
  if (!churchId) throw new ApiError(500, "Partage sans église");

  const config = share.config as CollectionConfigShape | null;
  const hasEvents = Boolean(share.mediaEventId) || (config?.eventIds?.length ?? 0) > 0;
  const hasProjects = Boolean(share.mediaProjectId) || (config?.projectIds?.length ?? 0) > 0;

  if (hasEvents) await requireMediaManageAccess(churchId, "PHOTOS");
  if (hasProjects) await requireMediaManageAccess(churchId, "VISUELS");

  await db.mediaShareToken.delete({ where: { id } });

  await logAudit({
    userId: session.user.id,
    churchId,
    action: "DELETE",
    entityType: "MediaShareToken",
    entityId: id,
    details: { type: share.type, label: share.label },
  });
}
