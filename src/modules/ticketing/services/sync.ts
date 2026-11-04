import type { TicketingRole } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import type { SyncOp } from "../schemas";
import { createWalkIn } from "./booking";
import { deliverItem, recordOnsiteSale } from "./catering";
import { recordReceipt } from "./payments";
import { computePresence, isAnomalous, type PassageLite } from "./presence";

/**
 * Synchronisation des écrans de terrain (spec 074, lot 2 et 3). Chaque opération porte un
 * identifiant généré par l'appareil : la rejouer ne change rien (idempotence). L'horloge de
 * l'appareil est corrigée de l'écart mesuré à l'envoi. Un passage incohérent (entrée d'une
 * personne déjà à l'intérieur) est gardé et signalé, jamais perdu.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

export type OpStatus = "applied" | "duplicate" | "rejected";
export interface OpResult {
  id: string;
  status: OpStatus;
  reason?: string;
}

const RECEPTION_OPS = new Set(["passage", "manual", "walkin", "receipt"]);
const CATERING_OPS = new Set(["delivery", "onsiteSale"]);

/** Écart d'horloge appliqué s'il dépasse 30 s ; une heure future est ramenée à maintenant. */
export function correctClock(scannedAt: Date, clientTime: Date, now: Date): Date {
  const offset = now.getTime() - clientTime.getTime();
  const corrected = Math.abs(offset) > 30_000 ? new Date(scannedAt.getTime() + offset) : scannedAt;
  return corrected > now ? now : corrected;
}

function allowed(op: SyncOp, roles: Set<TicketingRole>): boolean {
  if (roles.has("ORGANIZER")) return true;
  if (RECEPTION_OPS.has(op.type)) return roles.has("RECEPTION");
  if (CATERING_OPS.has(op.type)) return roles.has("CATERING");
  return false;
}

type PassageOp = Extract<SyncOp, { type: "passage" | "manual" }>;

/** État partagé par les opérations d'un envoi, traitées dans l'ordre. */
interface SyncContext {
  eventId: string;
  deviceId: string;
  clientTime: Date;
  now: Date;
  operator: { userId: string; roles: Set<TicketingRole> };
  known: Set<string>;
  history: PassageLite[];
  activeParticipants: Set<string>;
  validAssignments: Set<string>;
  anomalies: number;
}

/** Applique `fn` à chaque élément, l'un après l'autre (l'ordre compte pour les anomalies). */
async function inOrder<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  await items.reduce(async (previous, item) => {
    await previous;
    results.push(await fn(item));
  }, Promise.resolve());
  return results;
}

function passageTarget(ctx: SyncContext, op: PassageOp): boolean {
  if (op.type === "manual") return true;
  if (op.subject === "PARTICIPANT") return !!op.participantId && ctx.activeParticipants.has(op.participantId);
  return !!op.assignmentId && ctx.validAssignments.has(op.assignmentId);
}

async function applyPassage(ctx: SyncContext, op: PassageOp): Promise<OpResult> {
  if (ctx.known.has(op.id)) return { id: op.id, status: "duplicate" };
  if (!passageTarget(ctx, op)) return { id: op.id, status: "rejected", reason: "Billet ou badge inconnu, ou annulé" };
  const isPassage = op.type === "passage";
  const passage: PassageLite = {
    id: op.id,
    subject: isPassage ? op.subject : "MANUAL",
    participantId: isPassage && op.subject === "PARTICIPANT" ? (op.participantId ?? null) : null,
    assignmentId: isPassage && op.subject === "STAFF" ? (op.assignmentId ?? null) : null,
    direction: op.direction,
    delta: 1,
    scannedAt: correctClock(op.scannedAt, ctx.clientTime, ctx.now),
    receivedAt: ctx.now,
  };
  const anomaly = isAnomalous(ctx.history, passage);
  if (anomaly) ctx.anomalies++;
  const prisma = await db();
  await prisma.ticketingPassage.create({
    data: {
      ...passage,
      eventId: ctx.eventId,
      reason: isPassage ? null : op.reason,
      deviceId: ctx.deviceId,
      operatorId: ctx.operator.userId,
      gate: op.gate ?? null,
      anomaly,
    },
  });
  ctx.history.push(passage);
  ctx.known.add(op.id);
  return { id: op.id, status: "applied" };
}

async function applyWalkIn(ctx: SyncContext, op: Extract<SyncOp, { type: "walkin" }>): Promise<OpResult> {
  const created = await createWalkIn(
    ctx.eventId,
    op.id,
    { participants: op.participants.map((p) => ({ ...p, options: [] })), phone: op.phone, method: op.method },
    ctx.operator.userId
  );
  if (created.duplicate) return { id: op.id, status: "duplicate" };
  if (op.enter) {
    const scannedAt = correctClock(op.scannedAt, ctx.clientTime, ctx.now);
    const rows = created.participantIds.map((participantId, i) => ({
      id: `${op.id}-in-${i}`,
      eventId: ctx.eventId,
      subject: "PARTICIPANT" as const,
      participantId,
      direction: "IN" as const,
      deviceId: ctx.deviceId,
      operatorId: ctx.operator.userId,
      gate: op.gate ?? null,
      scannedAt,
    }));
    const prisma = await db();
    await prisma.ticketingPassage.createMany({ data: rows, skipDuplicates: true });
    ctx.history.push(...rows.map((r) => ({ ...r, assignmentId: null, delta: 1, receivedAt: ctx.now })));
  }
  return { id: op.id, status: "applied" };
}

async function applyReceipt(ctx: SyncContext, op: Extract<SyncOp, { type: "receipt" }>): Promise<OpResult> {
  const prisma = await db();
  const existing = await prisma.ticketingPayment.findUnique({ where: { opId: op.id }, select: { id: true } });
  if (existing) return { id: op.id, status: "duplicate" };
  const { roles } = ctx.operator;
  const scope = roles.has("ORGANIZER") || roles.has("TREASURER") ? "all" : "entry";
  const charges = op.participantIds.map((id) => ({ type: "entry" as const, id }));
  await recordReceipt(ctx.eventId, op.bookingId, { method: op.method, charges, opId: op.id }, ctx.operator.userId, scope);
  return { id: op.id, status: "applied" };
}

async function applyOne(ctx: SyncContext, op: SyncOp): Promise<OpResult> {
  switch (op.type) {
    case "passage":
    case "manual":
      return applyPassage(ctx, op);
    case "walkin":
      return applyWalkIn(ctx, op);
    case "receipt":
      return applyReceipt(ctx, op);
    case "delivery": {
      const scannedAt = correctClock(op.scannedAt, ctx.clientTime, ctx.now);
      const r = await deliverItem(ctx.eventId, { id: op.id, itemId: op.itemId, delivered: op.delivered, method: op.method, scannedAt }, ctx.operator.userId);
      return { id: op.id, status: r.changed ? "applied" : "duplicate" };
    }
    case "onsiteSale": {
      const r = await recordOnsiteSale(ctx.eventId, { ...op, scannedAt: correctClock(op.scannedAt, ctx.clientTime, ctx.now) }, ctx.operator.userId);
      return { id: op.id, status: r.duplicate ? "duplicate" : "applied" };
    }
  }
}

async function safeApply(ctx: SyncContext, op: SyncOp): Promise<OpResult> {
  if (!allowed(op, ctx.operator.roles)) return { id: op.id, status: "rejected", reason: "Rôle insuffisant" };
  try {
    return await applyOne(ctx, op);
  } catch (error) {
    return { id: op.id, status: "rejected", reason: error instanceof ApiError ? error.message : "Opération refusée" };
  }
}

export async function applyOperations(
  eventId: string,
  input: { deviceId: string; clientTime: Date; ops: SyncOp[] },
  operator: { userId: string; roles: Set<TicketingRole> }
) {
  const prisma = await db();
  const now = new Date();
  const event = await prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { capacity: true, status: true } });
  if (event.status === "DRAFT" || event.status === "ARCHIVED") throw new ApiError(409, "Événement fermé au contrôle");

  const passageOps = input.ops.filter((o): o is PassageOp => o.type === "passage" || o.type === "manual");
  const participantIds = passageOps.flatMap((o) => (o.type === "passage" && o.participantId ? [o.participantId] : []));
  const assignmentIds = passageOps.flatMap((o) => (o.type === "passage" && o.assignmentId ? [o.assignmentId] : []));
  const [knownRows, history, participants, assignments] = await Promise.all([
    prisma.ticketingPassage.findMany({ where: { id: { in: passageOps.map((o) => o.id) } }, select: { id: true } }),
    prisma.ticketingPassage.findMany({
      where: { eventId },
      select: { id: true, subject: true, participantId: true, assignmentId: true, direction: true, delta: true, scannedAt: true, receivedAt: true },
    }),
    prisma.ticketingParticipant.findMany({ where: { id: { in: participantIds }, eventId }, select: { id: true, status: true } }),
    prisma.ticketingAssignment.findMany({ where: { id: { in: assignmentIds }, eventId }, select: { id: true } }),
  ]);
  const ctx: SyncContext = {
    eventId,
    deviceId: input.deviceId,
    clientTime: input.clientTime,
    now,
    operator,
    known: new Set(knownRows.map((p) => p.id)),
    history: history as PassageLite[],
    activeParticipants: new Set(participants.filter((p) => p.status === "ACTIVE").map((p) => p.id)),
    validAssignments: new Set(assignments.map((a) => a.id)),
    anomalies: 0,
  };
  const results = await inOrder(input.ops, (op) => safeApply(ctx, op));

  const ages = await prisma.ticketingParticipant.findMany({ where: { eventId }, select: { id: true, ageGroup: true } });
  const counts = computePresence(ctx.history, new Map(ages.map((a) => [a.id, a.ageGroup])));
  const { notifyCapacity } = await import("./presence");
  await notifyCapacity(eventId, counts.total);
  if (ctx.anomalies > 0) {
    const plural = ctx.anomalies > 1 ? "s" : "";
    const { notifyEventTeam } = await import("./team-notify");
    await notifyEventTeam(eventId, ["ORGANIZER"], {
      type: "TICKETING_ANOMALY",
      title: "Contrôle : passage incohérent",
      message: `${ctx.anomalies} passage${plural} incohérent${plural} (entrée déjà enregistrée, ou sortie sans entrée).`,
      link: `/billetterie/${eventId}?vue=presences`,
    });
  }
  return { results, counts, capacity: event.capacity, serverTime: now.toISOString() };
}
