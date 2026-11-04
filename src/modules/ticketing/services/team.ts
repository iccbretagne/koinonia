import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/errors";
import { QR_PREFIX } from "../schemas";
import { deriveToken, newSalt, tokenPair } from "./tokens";

/**
 * Équipe d'un événement (spec 074, lot 2) : postes, affectations (compte de l'église ou
 * intervenant nommé), badges. Propre à l'événement : le planning des départements n'est pas
 * touché ; « Mon planning » lit seulement les affectations.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

async function audit(userId: string, churchId: string, action: "CREATE" | "UPDATE" | "DELETE", entityType: string, entityId: string, details?: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId, action, entityType, entityId, details });
}

async function eventChurch(eventId: string) {
  const prisma = await db();
  return prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { churchId: true, title: true, startsAt: true } });
}

export const badgeCode = (assignmentId: string, salt: string) => `${QR_PREFIX.badge}${deriveToken("badge", assignmentId, salt)}`;

// ── Postes ───────────────────────────────────────────────────────────────────

export async function createPost(eventId: string, userId: string, name: string) {
  const prisma = await db();
  const event = await eventChurch(eventId);
  const position = await prisma.ticketingPost.count({ where: { eventId } });
  const post = await prisma.ticketingPost.create({ data: { eventId, name, position } });
  await audit(userId, event.churchId, "CREATE", "TicketingPost", post.id, { eventId, name });
  return post;
}

async function postOf(eventId: string, postId: string) {
  const prisma = await db();
  const post = await prisma.ticketingPost.findUnique({ where: { id: postId } });
  if (post?.eventId !== eventId) throw new ApiError(404, "Poste introuvable");
  return post;
}

export async function renamePost(eventId: string, postId: string, userId: string, name: string) {
  await postOf(eventId, postId);
  const prisma = await db();
  const event = await eventChurch(eventId);
  const post = await prisma.ticketingPost.update({ where: { id: postId }, data: { name } });
  await audit(userId, event.churchId, "UPDATE", "TicketingPost", postId, { name });
  return post;
}

/** Supprime le poste ; ses affectations restent, sans poste. */
export async function deletePost(eventId: string, postId: string, userId: string) {
  const post = await postOf(eventId, postId);
  const prisma = await db();
  const event = await eventChurch(eventId);
  await prisma.ticketingPost.delete({ where: { id: postId } });
  await audit(userId, event.churchId, "DELETE", "TicketingPost", postId, { name: post.name });
}

// ── Affectations ─────────────────────────────────────────────────────────────

export interface AssignmentInput {
  postId?: string | null;
  userId?: string | null;
  guestName?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

/** Affecte un compte de l'église (quel que soit son département) ou un intervenant nommé. */
export async function createAssignment(eventId: string, actorId: string, input: AssignmentInput) {
  const prisma = await db();
  const event = await eventChurch(eventId);
  if (Boolean(input.userId) === Boolean(input.guestName)) throw new ApiError(400, "Indiquez un compte ou le nom d'un intervenant");
  if (input.postId) await postOf(eventId, input.postId);
  if (input.userId) {
    const member = await prisma.userChurchRole.findFirst({ where: { userId: input.userId, churchId: event.churchId }, select: { id: true } });
    if (!member) throw new ApiError(400, "Seuls des comptes de l'église peuvent être affectés");
  }
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw new ApiError(400, "La fin du créneau doit suivre son début");
  const id = randomUUID();
  const salt = newSalt();
  const assignment = await prisma.ticketingAssignment.create({
    data: {
      id,
      eventId,
      postId: input.postId ?? null,
      userId: input.userId ?? null,
      guestName: input.userId ? null : input.guestName,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      tokenSalt: salt,
      badgeTokenHash: tokenPair("badge", id, salt).hash,
    },
    include: { post: { select: { name: true } } },
  });
  await audit(actorId, event.churchId, "CREATE", "TicketingAssignment", id, { eventId, userId: input.userId ?? null, guestName: input.guestName ?? null });
  if (input.userId && input.userId !== actorId) {
    const { createNotification } = await import("@/lib/notifications");
    await createNotification({
      userId: input.userId,
      domain: "ticketing",
      type: "TICKETING_ASSIGNMENT",
      title: `${event.title} : vous êtes dans l'équipe`,
      message: assignment.post ? `Poste : ${assignment.post.name}.` : "Vous êtes affecté(e) à l'équipe de l'événement.",
      link: "/planning",
    }).catch(() => undefined);
  }
  return assignment;
}

export async function deleteAssignment(eventId: string, assignmentId: string, actorId: string) {
  const prisma = await db();
  const assignment = await prisma.ticketingAssignment.findUnique({ where: { id: assignmentId } });
  if (assignment?.eventId !== eventId) throw new ApiError(404, "Affectation introuvable");
  const event = await eventChurch(eventId);
  await prisma.ticketingAssignment.delete({ where: { id: assignmentId } });
  await audit(actorId, event.churchId, "DELETE", "TicketingAssignment", assignmentId, { userId: assignment.userId, guestName: assignment.guestName });
}

/** Postes et affectations, avec le code du badge (pour l'impression par l'organisateur). */
export async function listTeam(eventId: string) {
  const prisma = await db();
  const [posts, assignments] = await Promise.all([
    prisma.ticketingPost.findMany({ where: { eventId }, orderBy: { position: "asc" } }),
    prisma.ticketingAssignment.findMany({
      where: { eventId },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
      include: { user: { select: { id: true, name: true, email: true } }, post: { select: { id: true, name: true } } },
    }),
  ]);
  return {
    posts: posts.map((p) => ({ id: p.id, name: p.name })),
    assignments: assignments.map((a) => ({
      id: a.id,
      name: a.user?.name ?? a.user?.email ?? a.guestName ?? "Intervenant",
      userId: a.userId,
      guest: !a.userId,
      postId: a.postId,
      postName: a.post?.name ?? null,
      startsAt: a.startsAt?.toISOString() ?? null,
      endsAt: a.endsAt?.toISOString() ?? null,
      badge: badgeCode(a.id, a.tokenSalt),
    })),
  };
}
export type TeamView = Awaited<ReturnType<typeof listTeam>>;

/** Affectations d'un compte à des événements non clôturés, pour « Mon planning » (badge compris). */
export async function listAssignmentsForUser(userId: string) {
  const prisma = await db();
  const rows = await prisma.ticketingAssignment.findMany({
    where: { userId, event: { status: { in: ["OPEN", "CLOSED"] }, endsAt: { gte: new Date() } } },
    orderBy: { event: { startsAt: "asc" } },
    include: { event: { select: { id: true, title: true, startsAt: true, endsAt: true, location: true } }, post: { select: { name: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    event: { id: a.event.id, title: a.event.title, startsAt: a.event.startsAt.toISOString(), endsAt: a.event.endsAt.toISOString(), location: a.event.location },
    postName: a.post?.name ?? null,
    startsAt: a.startsAt?.toISOString() ?? null,
    endsAt: a.endsAt?.toISOString() ?? null,
    badge: badgeCode(a.id, a.tokenSalt),
  }));
}
export type MyAssignment = Awaited<ReturnType<typeof listAssignmentsForUser>>[number];
