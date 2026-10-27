import { ApiError } from "@/lib/api-utils";
import type { Prisma, SystemMessageSeverity } from "@/generated/prisma/client";
import { audienceSchema, EMPTY_AUDIENCE, type Audience, type CreateMessageInput, type UpdateMessageInput } from "../schemas";
import { isInAudience, loadViewerFacts, resolveRecipients } from "./audience";

/**
 * Messages système (spec 071) : rédaction, correction, retrait, liste et détail. Prisma et
 * l'audit sont importés à la demande (le layout importe l'index du module).
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

export type MessageStatus = "scheduled" | "active" | "past";

export interface MessageActor {
  id: string;
}

export interface SystemMessageView {
  id: string;
  churchId: string | null;
  title: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  severity: SystemMessageSeverity;
  audience: Audience;
  startsAt: string;
  endsAt: string;
  withdrawnAt: string | null;
  status: MessageStatus;
  /** « Secrétariat de <église> » ou « Administration de Koinonia ». */
  author: string;
}

export interface SystemMessageStats {
  /** Comptes notifiés au début de la période ; `null` tant qu'elle n'a pas commencé. */
  recipients: number | null;
  seen: number;
  dismissed: number;
}

const MESSAGE_SELECT = {
  id: true,
  churchId: true,
  title: true,
  body: true,
  linkUrl: true,
  linkLabel: true,
  severity: true,
  audience: true,
  startsAt: true,
  endsAt: true,
  withdrawnAt: true,
  notifiedAt: true,
  recipientCount: true,
  church: { select: { name: true } },
} satisfies Prisma.SystemMessageSelect;

type MessageRow = Prisma.SystemMessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

export function messageStatus(
  row: { startsAt: Date; endsAt: Date; withdrawnAt: Date | null },
  now = new Date()
): MessageStatus {
  if (row.withdrawnAt || row.endsAt.getTime() <= now.getTime()) return "past";
  return row.startsAt.getTime() > now.getTime() ? "scheduled" : "active";
}

/** Public stocké : relu par Zod, un JSON altéré ne cible personne plutôt que tout le monde. */
export function parseAudience(value: unknown): Audience {
  const parsed = audienceSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...EMPTY_AUDIENCE, roles: ["SUPER_ADMIN"] };
}

function toView(row: MessageRow, now = new Date()): SystemMessageView {
  return {
    id: row.id,
    churchId: row.churchId,
    title: row.title,
    body: row.body,
    linkUrl: row.linkUrl,
    linkLabel: row.linkLabel,
    severity: row.severity,
    audience: parseAudience(row.audience),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    status: messageStatus(row, now),
    author: row.church ? `Secrétariat de ${row.church.name}` : "Administration de Koinonia",
  };
}

async function audit(
  actor: MessageActor,
  churchId: string | null,
  action: "CREATE" | "UPDATE",
  messageId: string,
  details: Record<string, unknown>
) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({
    userId: actor.id,
    churchId: churchId ?? undefined,
    action,
    entityType: "SystemMessage",
    entityId: messageId,
    details,
  });
}

/** Ministères et départements choisis : tous dans l'église du message, sinon 400. */
async function assertAudience(churchId: string | null, audience: Audience) {
  const hasOrg = audience.ministryIds.length > 0 || audience.departmentIds.length > 0;
  if (churchId === null) {
    if (hasOrg) throw new ApiError(400, "Un message pour toute l'instance ne cible que des rôles.");
  } else if (hasOrg) {
    const prisma = await db();
    const [ministries, departments] = await Promise.all([
      prisma.ministry.count({ where: { id: { in: audience.ministryIds }, churchId } }),
      prisma.department.count({ where: { id: { in: audience.departmentIds }, ministry: { churchId } } }),
    ]);
    if (ministries !== audience.ministryIds.length || departments !== audience.departmentIds.length) {
      throw new ApiError(400, "Ministère ou département inconnu dans cette église.");
    }
  }
  const recipients = await resolveRecipients({ churchId, audience });
  if (recipients.length === 0) throw new ApiError(400, "Aucun compte ne correspond à ce public.");
}

/** Envoi des notifications dues, sans faire attendre l'auteur (le cron rattrape un échec). */
function triggerDispatch() {
  void import("./dispatch")
    .then(({ dispatchDueMessages }) => dispatchDueMessages())
    .catch(async (err) => {
      const { logger } = await import("@/lib/logger");
      logger.error({ err }, "Messages système : envoi immédiat en échec, le cron reprendra");
    });
}

export async function createMessage(input: CreateMessageInput, actor: MessageActor): Promise<SystemMessageView> {
  const churchId = input.scope === "church" ? input.churchId : null;
  await assertAudience(churchId, input.audience);
  const now = new Date();
  const startsAt = input.startsAt && input.startsAt.getTime() > now.getTime() ? input.startsAt : now;
  const prisma = await db();
  const row = await prisma.systemMessage.create({
    data: {
      churchId,
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl,
      linkLabel: input.linkUrl ? input.linkLabel : null,
      severity: input.severity,
      audience: input.audience,
      startsAt,
      endsAt: input.endsAt,
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: MESSAGE_SELECT,
  });
  await audit(actor, churchId, "CREATE", row.id, {
    title: row.title,
    severity: row.severity,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  });
  if (startsAt.getTime() <= now.getTime()) triggerDispatch();
  return toView(row, now);
}

async function loadMessage(id: string): Promise<MessageRow> {
  const prisma = await db();
  const row = await prisma.systemMessage.findUnique({ where: { id }, select: MESSAGE_SELECT });
  if (!row) throw new ApiError(404, "Message introuvable");
  return row;
}

/** Église du message pour la garde d'auteur : `null` pour un message d'instance. */
export async function getMessageChurchId(id: string): Promise<string | null> {
  return (await loadMessage(id)).churchId;
}

/**
 * Programmé : tout se modifie. En cours : titre, texte, lien et fin, sans nouvelle notification.
 * Passé ou retiré : rien.
 */
export async function updateMessage(
  id: string,
  input: UpdateMessageInput,
  actor: MessageActor
): Promise<SystemMessageView> {
  const now = new Date();
  const current = await loadMessage(id);
  const status = messageStatus(current, now);
  if (status === "past") throw new ApiError(400, "Ce message est terminé ou retiré.");

  if (status === "active") {
    const locked = (["audience", "severity", "startsAt"] as const).filter((key) => input[key] !== undefined);
    if (locked.length > 0) {
      throw new ApiError(400, "Un message en cours garde son public, sa sévérité et son début.");
    }
  }
  if (input.audience) await assertAudience(current.churchId, input.audience);

  const startsAt = input.startsAt ?? current.startsAt;
  const endsAt = input.endsAt ?? current.endsAt;
  if (endsAt.getTime() <= startsAt.getTime()) throw new ApiError(400, "La fin doit être après le début.");

  const data: Prisma.SystemMessageUpdateInput = { updatedBy: { connect: { id: actor.id } } };
  if (input.title !== undefined) data.title = input.title;
  if (input.body !== undefined) data.body = input.body;
  if (input.linkUrl !== undefined) {
    data.linkUrl = input.linkUrl;
    data.linkLabel = input.linkUrl ? (input.linkLabel ?? current.linkLabel) : null;
  } else if (input.linkLabel !== undefined) {
    data.linkLabel = current.linkUrl ? input.linkLabel : null;
  }
  if (input.severity !== undefined) data.severity = input.severity;
  if (input.audience !== undefined) data.audience = input.audience;
  if (input.startsAt) data.startsAt = input.startsAt.getTime() > now.getTime() ? input.startsAt : now;
  if (input.endsAt) data.endsAt = input.endsAt;

  const prisma = await db();
  const row = await prisma.systemMessage.update({ where: { id }, data, select: MESSAGE_SELECT });
  const changedFields = Object.keys(input).filter((key) => input[key as keyof UpdateMessageInput] !== undefined);
  await audit(actor, row.churchId, "UPDATE", id, { changedFields });
  if (row.startsAt.getTime() <= now.getTime() && !row.notifiedAt) triggerDispatch();
  return toView(row, now);
}

/** Retire un message : il disparaît tout de suite ; programmé, il ne sera jamais notifié. */
export async function withdrawMessage(id: string, actor: MessageActor): Promise<SystemMessageView> {
  const now = new Date();
  const current = await loadMessage(id);
  if (messageStatus(current, now) === "past") throw new ApiError(400, "Ce message est déjà terminé ou retiré.");
  const prisma = await db();
  const row = await prisma.systemMessage.update({
    where: { id },
    data: { withdrawnAt: now, updatedBy: { connect: { id: actor.id } } },
    select: MESSAGE_SELECT,
  });
  await audit(actor, row.churchId, "UPDATE", id, { withdrawn: true });
  return toView(row, now);
}

async function loadStats(rows: MessageRow[]): Promise<Map<string, SystemMessageStats>> {
  const ids = rows.map((r) => r.id);
  const prisma = await db();
  const [seen, dismissed] = await Promise.all([
    prisma.systemMessageReceipt.groupBy({ by: ["messageId"], where: { messageId: { in: ids } }, _count: { _all: true } }),
    prisma.systemMessageReceipt.groupBy({
      by: ["messageId"],
      where: { messageId: { in: ids }, dismissedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const seenBy = new Map(seen.map((g) => [g.messageId, g._count._all]));
  const dismissedBy = new Map(dismissed.map((g) => [g.messageId, g._count._all]));
  return new Map(
    rows.map((r) => [
      r.id,
      { recipients: r.recipientCount, seen: seenBy.get(r.id) ?? 0, dismissed: dismissedBy.get(r.id) ?? 0 },
    ])
  );
}

export interface MessageListItem extends SystemMessageView {
  stats: SystemMessageStats;
  /** Message d'instance vu depuis une église : lecture seule hors Super Admin. */
  readOnly: boolean;
}

/** Messages d'une église et messages d'instance, du plus récent au plus ancien (200 au plus). */
export async function listMessages(churchId: string, viewer: { isSuperAdmin: boolean }): Promise<MessageListItem[]> {
  const prisma = await db();
  const rows = await prisma.systemMessage.findMany({
    where: { OR: [{ churchId }, { churchId: null }] },
    orderBy: { startsAt: "desc" },
    take: 200,
    select: MESSAGE_SELECT,
  });
  const stats = await loadStats(rows);
  const now = new Date();
  return rows.map((row) => ({
    ...toView(row, now),
    stats: stats.get(row.id)!,
    readOnly: row.churchId === null && !viewer.isSuperAdmin,
  }));
}

export interface MessageViewer {
  userId: string;
  churchIds: string[];
}

/** Personne connectée → lecteur des messages : ses églises sont celles de ses rôles. */
export function messageViewerFromSession(session: {
  user: { id?: string; churchRoles: { churchId: string }[] };
}): MessageViewer {
  return {
    userId: session.user.id!,
    churchIds: Array.from(new Set(session.user.churchRoles.map((r) => r.churchId))),
  };
}

/** Message et statistiques pour son auteur (la garde est vérifiée par l'appelant). */
export async function getMessageForAuthor(id: string): Promise<MessageListItem> {
  const row = await loadMessage(id);
  const stats = await loadStats([row]);
  return { ...toView(row), stats: stats.get(row.id)!, readOnly: false };
}

/** Message pour une personne du public ; 404 hors public (ne révèle pas son existence). */
export async function getMessageForViewer(id: string, viewer: MessageViewer): Promise<SystemMessageView> {
  const row = await loadMessage(id);
  if (!(await viewerInAudience(row, viewer))) throw new ApiError(404, "Message introuvable");
  return toView(row);
}

export async function viewerInAudience(
  row: { churchId: string | null; audience: unknown },
  viewer: MessageViewer
): Promise<boolean> {
  const churchIds = row.churchId === null ? viewer.churchIds : viewer.churchIds.filter((c) => c === row.churchId);
  if (churchIds.length === 0) return false;
  const facts = await loadViewerFacts(viewer.userId, churchIds);
  return isInAudience({ churchId: row.churchId, audience: parseAudience(row.audience) }, facts);
}

export interface AudienceOptions {
  ministries: { id: string; name: string; departments: { id: string; name: string }[] }[];
}

/** Ministères et départements de l'église, pour choisir le public d'un message. */
export async function getAudienceOptions(churchId: string): Promise<AudienceOptions> {
  const prisma = await db();
  const ministries = await prisma.ministry.findMany({
    where: { churchId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      departments: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
  return { ministries };
}
