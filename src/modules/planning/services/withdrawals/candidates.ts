import { getPlanningAvailability } from "../availability/grid";
import type { DbClient } from "../availability/db";
import { PLANNED_STATUSES } from "../staffing-gaps";

/**
 * Remplaçants possibles d'un service rendu vacant (spec 061) : STAR du département, ni le STAR
 * désisté ni déjà planifiés sur ce service, « Disponible » ou « Si besoin » pour l'événement, et
 * pas déjà de service dans un autre département ce jour-là.
 */

export interface ReplacementCandidate {
  memberId: string;
  firstName: string;
  lastName: string;
  state: "AVAILABLE" | "IF_NEEDED";
}

export interface WithdrawalSlot {
  churchId: string;
  departmentId: string;
  memberId: string;
  event: { id: string; date: Date };
}

export async function listReplacementCandidates(
  slot: WithdrawalSlot,
  db: DbClient,
  now: Date = new Date()
): Promise<ReplacementCandidate[]> {
  const [memberDepts, planned] = await Promise.all([
    db.memberDepartment.findMany({
      where: { departmentId: slot.departmentId },
      select: { member: { select: { id: true, firstName: true, lastName: true } } },
    }),
    db.planning.findMany({
      where: {
        status: { in: [...PLANNED_STATUSES] },
        eventDepartment: { eventId: slot.event.id, departmentId: slot.departmentId },
      },
      select: { memberId: true },
    }),
  ]);
  const excluded = new Set([slot.memberId, ...planned.map((p) => p.memberId)]);
  const members = memberDepts.map((d) => d.member).filter((m) => !excluded.has(m.id));
  if (members.length === 0) return [];

  const availability = await getPlanningAvailability(
    slot.churchId,
    slot.event,
    slot.departmentId,
    members.map((m) => m.id),
    db,
    now
  );

  const candidates: ReplacementCandidate[] = [];
  for (const m of members) {
    const a = availability.members.get(m.id);
    if (!a || a.busyElsewhere.length > 0) continue;
    if (a.state !== "AVAILABLE" && a.state !== "IF_NEEDED") continue;
    candidates.push({ memberId: m.id, firstName: m.firstName, lastName: m.lastName, state: a.state });
  }
  const rank = (c: ReplacementCandidate) => (c.state === "AVAILABLE" ? 0 : 1);
  return candidates.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.lastName.localeCompare(b.lastName, "fr") ||
      a.firstName.localeCompare(b.firstName, "fr")
  );
}
