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

export async function applyOperations(
  eventId: string,
  input: { deviceId: string; clientTime: Date; ops: SyncOp[] },
  operator: { userId: string; roles: Set<TicketingRole> }
) {
  const prisma = await db();
  const now = new Date();
  const event = await prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { capacity: true, status: true } });
  if (event.status === "DRAFT" || event.status === "ARCHIVED") throw new ApiError(409, "Événement fermé au contrôle");

  const passageOps = input.ops.filter((o): o is Extract<SyncOp, { type: "passage" | "manual" }> => o.type === "passage" || o.type === "manual");
  const known = new Set(
    (await prisma.ticketingPassage.findMany({ where: { id: { in: passageOps.map((o) => o.id) } }, select: { id: true } })).map((p) => p.id)
  );
  const history: PassageLite[] = await prisma.ticketingPassage.findMany({
    where: { eventId },
    select: { id: true, subject: true, participantId: true, assignmentId: true, direction: true, delta: true, scannedAt: true, receivedAt: true },
  });
  const participantIds = passageOps.flatMap((o) => (o.type === "passage" && o.participantId ? [o.participantId] : []));
  const assignmentIds = passageOps.flatMap((o) => (o.type === "passage" && o.assignmentId ? [o.assignmentId] : []));
  const [participants, assignments] = await Promise.all([
    prisma.ticketingParticipant.findMany({ where: { id: { in: participantIds }, eventId }, select: { id: true, status: true } }),
    prisma.ticketingAssignment.findMany({ where: { id: { in: assignmentIds }, eventId }, select: { id: true } }),
  ]);
  const activeParticipants = new Set(participants.filter((p) => p.status === "ACTIVE").map((p) => p.id));
  const validAssignments = new Set(assignments.map((a) => a.id));

  const results: OpResult[] = [];
  let anomalies = 0;
  for (const op of input.ops) {
    if (!allowed(op, operator.roles)) {
      results.push({ id: op.id, status: "rejected", reason: "Rôle insuffisant" });
      continue;
    }
    try {
      results.push(await applyOne(op));
    } catch (error) {
      results.push({ id: op.id, status: "rejected", reason: error instanceof ApiError ? error.message : "Opération refusée" });
    }
  }

  async function applyOne(op: SyncOp): Promise<OpResult> {
    switch (op.type) {
      case "passage":
      case "manual": {
        if (known.has(op.id)) return { id: op.id, status: "duplicate" };
        if (op.type === "passage") {
          const ok = op.subject === "PARTICIPANT" ? !!op.participantId && activeParticipants.has(op.participantId) : !!op.assignmentId && validAssignments.has(op.assignmentId);
          if (!ok) return { id: op.id, status: "rejected", reason: "Billet ou badge inconnu, ou annulé" };
        }
        const passage: PassageLite = {
          id: op.id,
          subject: op.type === "manual" ? "MANUAL" : op.subject,
          participantId: op.type === "passage" && op.subject === "PARTICIPANT" ? op.participantId! : null,
          assignmentId: op.type === "passage" && op.subject === "STAFF" ? op.assignmentId! : null,
          direction: op.direction,
          delta: 1,
          scannedAt: correctClock(op.scannedAt, input.clientTime, now),
          receivedAt: now,
        };
        const anomaly = isAnomalous(history, passage);
        if (anomaly) anomalies++;
        await prisma.ticketingPassage.create({
          data: {
            ...passage,
            eventId,
            reason: op.type === "manual" ? op.reason : null,
            deviceId: input.deviceId,
            operatorId: operator.userId,
            gate: op.gate ?? null,
            anomaly,
          },
        });
        history.push(passage);
        known.add(op.id);
        return { id: op.id, status: "applied" };
      }
      case "walkin": {
        const created = await createWalkIn(eventId, op.id, { participants: op.participants.map((p) => ({ ...p, options: [] })), phone: op.phone, method: op.method }, operator.userId);
        if (created.duplicate) return { id: op.id, status: "duplicate" };
        if (op.enter) {
          const scannedAt = correctClock(op.scannedAt, input.clientTime, now);
          const rows = created.participantIds.map((participantId, i) => ({
            id: `${op.id}-in-${i}`,
            eventId,
            subject: "PARTICIPANT" as const,
            participantId,
            direction: "IN" as const,
            deviceId: input.deviceId,
            operatorId: operator.userId,
            gate: op.gate ?? null,
            scannedAt,
          }));
          await prisma.ticketingPassage.createMany({ data: rows, skipDuplicates: true });
          history.push(...rows.map((r) => ({ ...r, assignmentId: null, delta: 1, receivedAt: now })));
        }
        return { id: op.id, status: "applied" };
      }
      case "receipt": {
        const existing = await prisma.ticketingPayment.findUnique({ where: { opId: op.id }, select: { id: true } });
        if (existing) return { id: op.id, status: "duplicate" };
        await recordReceipt(eventId, op.bookingId, { method: op.method, charges: op.participantIds.map((id) => ({ type: "entry" as const, id })), opId: op.id }, operator.userId, operator.roles.has("ORGANIZER") || operator.roles.has("TREASURER") ? "all" : "entry");
        return { id: op.id, status: "applied" };
      }
      case "delivery": {
        const r = await deliverItem(eventId, { id: op.id, itemId: op.itemId, delivered: op.delivered, method: op.method, scannedAt: correctClock(op.scannedAt, input.clientTime, now) }, operator.userId);
        return { id: op.id, status: r.changed ? "applied" : "duplicate" };
      }
      case "onsiteSale": {
        const r = await recordOnsiteSale(eventId, { ...op, scannedAt: correctClock(op.scannedAt, input.clientTime, now) }, operator.userId);
        return { id: op.id, status: r.duplicate ? "duplicate" : "applied" };
      }
    }
  }

  const ages = await prisma.ticketingParticipant.findMany({ where: { eventId }, select: { id: true, ageGroup: true } });
  const counts = computePresence(history, new Map(ages.map((a) => [a.id, a.ageGroup])));
  const { notifyCapacity } = await import("./presence");
  await notifyCapacity(eventId, counts.total);
  if (anomalies > 0) {
    const { notifyEventTeam } = await import("./team-notify");
    await notifyEventTeam(eventId, ["ORGANIZER"], {
      type: "TICKETING_ANOMALY",
      title: "Contrôle : passage incohérent",
      message: `${anomalies} passage${anomalies > 1 ? "s" : ""} incohérent${anomalies > 1 ? "s" : ""} (entrée déjà enregistrée, ou sortie sans entrée).`,
      link: `/billetterie/${eventId}?vue=presences`,
    });
  }
  return { results, counts, capacity: event.capacity, serverTime: now.toISOString() };
}
