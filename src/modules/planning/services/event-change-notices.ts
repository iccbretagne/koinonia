import type { Prisma } from "@/generated/prisma/client";

/**
 * Prévenir les personnes planifiées d'un déplacement ou d'une annulation d'événement (spec 059).
 *
 * Deux temps : `collectEventChangeNotices` lit l'audience DANS la transaction de l'appelant
 * (une suppression efface les plannings dans cette même transaction) et construit les
 * notifications sans rien écrire ; `sendEventChangeNotices` les envoie une fois la transaction
 * validée (avec `tx`, aucun email ne partirait).
 *
 * `@/lib/notifications` est importé dynamiquement (charge `@/lib/prisma` au niveau module),
 * comme dans les autres services du module, pour que l'index reste importable en test.
 */

type Db = Prisma.TransactionClient;

const PLANNED_STATUSES = ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"] as const;

export type EventChange =
  | { kind: "MOVED"; eventId: string; previousDate: Date; newDate: Date }
  | { kind: "CANCELLED"; eventId: string };

export interface PendingNotice {
  userId: string;
  type: "EVENT_RESCHEDULED" | "EVENT_CANCELLED" | "EVENT_CHANGES";
  title: string;
  message: string;
  link: string;
}

export interface EventChangeNotices {
  items: PendingNotice[];
}

export function emptyEventChangeNotices(): EventChangeNotices {
  return { items: [] };
}

export function mergeEventChangeNotices(a: EventChangeNotices, b: EventChangeNotices): EventChangeNotices {
  return { items: [...a.items, ...b.items] };
}

// ─── Audience ────────────────────────────────────────────────────────────────

interface DeptCount {
  name: string;
  ministryId: string;
  count: number;
}

export interface EventAudience {
  eventId: string;
  title: string;
  date: Date;
  /** Comptes liés des STAR planifiés. */
  plannedUserIds: Set<string>;
  /** Départements ayant au moins un planifié (avec ou sans compte). */
  departments: Map<string, DeptCount>;
}

export interface Leaders {
  /** userId → départements dont il est responsable (principal ou adjoint). */
  heads: Map<string, Set<string>>;
  /** userId → ministères dont il est Ministre. */
  ministers: Map<string, Set<string>>;
}

function addTo(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

export async function loadEventAudience(
  tx: Db,
  churchId: string,
  eventIds: string[]
): Promise<{ audiences: Map<string, EventAudience>; leaders: Leaders }> {
  const audiences = new Map<string, EventAudience>();
  const leaders: Leaders = { heads: new Map(), ministers: new Map() };
  if (eventIds.length === 0) return { audiences, leaders };

  const events = await tx.event.findMany({
    where: { id: { in: eventIds }, churchId },
    select: { id: true, title: true, date: true },
  });
  for (const e of events) {
    audiences.set(e.id, { eventId: e.id, title: e.title, date: e.date, plannedUserIds: new Set(), departments: new Map() });
  }
  if (audiences.size === 0) return { audiences, leaders };

  const plannings = await tx.planning.findMany({
    where: {
      status: { in: [...PLANNED_STATUSES] },
      eventDepartment: { eventId: { in: [...audiences.keys()] }, event: { churchId } },
    },
    select: {
      eventDepartment: {
        select: { eventId: true, departmentId: true, department: { select: { name: true, ministryId: true } } },
      },
      member: { select: { userLinks: { where: { churchId }, select: { userId: true } } } },
    },
  });

  const deptIds = new Set<string>();
  const ministryIds = new Set<string>();
  for (const p of plannings) {
    const audience = audiences.get(p.eventDepartment.eventId);
    if (!audience) continue;
    const { departmentId, department } = p.eventDepartment;
    const dept = audience.departments.get(departmentId) ?? { name: department.name, ministryId: department.ministryId, count: 0 };
    dept.count += 1;
    audience.departments.set(departmentId, dept);
    for (const l of p.member.userLinks) audience.plannedUserIds.add(l.userId);
    deptIds.add(departmentId);
    ministryIds.add(department.ministryId);
  }
  if (deptIds.size === 0) return { audiences, leaders };

  const [heads, ministers] = await Promise.all([
    tx.userDepartment.findMany({
      where: { departmentId: { in: [...deptIds] }, userChurchRole: { churchId, role: "DEPARTMENT_HEAD" } },
      select: { departmentId: true, userChurchRole: { select: { userId: true } } },
    }),
    tx.userChurchRole.findMany({
      where: { churchId, role: "MINISTER", ministryId: { in: [...ministryIds] } },
      select: { userId: true, ministryId: true },
    }),
  ]);
  for (const h of heads) addTo(leaders.heads, h.userChurchRole.userId, h.departmentId);
  for (const m of ministers) if (m.ministryId) addTo(leaders.ministers, m.userId, m.ministryId);

  return { audiences, leaders };
}

// ─── Construction (pure) ─────────────────────────────────────────────────────

const dayFmt = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = (d: Date) => `${dayFmt(d)} à ${timeFmt(d)}`;

function changeLine(change: EventChange, audience: EventAudience): string {
  if (change.kind === "CANCELLED") {
    return `« ${audience.title} » du ${dateTimeFmt(audience.date)} est annulé`;
  }
  const { previousDate: prev, newDate: next } = change;
  const sameDay = dayFmt(prev) === dayFmt(next);
  return sameDay
    ? `« ${audience.title} » du ${dayFmt(prev)} : l'horaire change, ${timeFmt(prev)} → ${timeFmt(next)}`
    : `« ${audience.title} » est déplacé : ${dateTimeFmt(prev)} → ${dateTimeFmt(next)}`;
}

interface Recipient {
  lead: boolean;
  lines: string[];
  kinds: Set<EventChange["kind"]>;
  titles: string[];
}

export function buildEventChangeNotices(
  changes: EventChange[],
  audiences: Map<string, EventAudience>,
  leaders: Leaders,
  opts: { actorId?: string | null; now: Date }
): EventChangeNotices {
  const recipients = new Map<string, Recipient>();
  const recipient = (userId: string) => {
    const r = recipients.get(userId) ?? { lead: false, lines: [], kinds: new Set(), titles: [] };
    recipients.set(userId, r);
    return r;
  };

  for (const change of changes) {
    const audience = audiences.get(change.eventId);
    if (!audience || audience.departments.size === 0) continue;
    const originDate = change.kind === "MOVED" ? change.previousDate : audience.date;
    if (originDate.getTime() < opts.now.getTime()) continue;
    if (change.kind === "MOVED" && change.previousDate.getTime() === change.newDate.getTime()) continue;

    const line = changeLine(change, audience);

    // Encadrants : départements supervisés (responsable ou ministère) ayant des planifiés.
    const leadDepts = new Map<string, DeptCount[]>();
    for (const [deptId, dept] of audience.departments) {
      for (const [userId, depts] of leaders.heads) if (depts.has(deptId)) leadDepts.set(userId, [...(leadDepts.get(userId) ?? []), dept]);
      for (const [userId, ministries] of leaders.ministers) {
        if (!ministries.has(dept.ministryId)) continue;
        const list = leadDepts.get(userId) ?? [];
        if (!list.includes(dept)) leadDepts.set(userId, [...list, dept]);
      }
    }

    for (const [userId, depts] of leadDepts) {
      const r = recipient(userId);
      r.lead = true;
      const summary = depts.map((d) => `${d.name} (${d.count})`).join(", ");
      const self = audience.plannedUserIds.has(userId) ? " Vous êtes vous-même planifié." : "";
      r.lines.push(`${line}. Personnes concernées : ${summary}.${self}`);
      r.kinds.add(change.kind);
      r.titles.push(audience.title);
    }
    for (const userId of audience.plannedUserIds) {
      if (leadDepts.has(userId)) continue;
      const r = recipient(userId);
      r.lines.push(`${line}.`);
      r.kinds.add(change.kind);
      r.titles.push(audience.title);
    }
  }

  const items: PendingNotice[] = [];
  for (const [userId, r] of recipients) {
    if (userId === opts.actorId || r.lines.length === 0) continue;
    // Un encadrant aussi planifié comme STAR sur un autre événement du lot garde une seule
    // notification : celle d'encadrant (lien vers la grille).
    const onlyMoved = r.kinds.size === 1 && r.kinds.has("MOVED");
    const onlyCancelled = r.kinds.size === 1 && r.kinds.has("CANCELLED");
    let type: PendingNotice["type"] = "EVENT_CHANGES";
    let changedWord = "modifiés";
    if (onlyMoved) {
      type = "EVENT_RESCHEDULED";
      changedWord = "déplacés";
    } else if (onlyCancelled) {
      type = "EVENT_CANCELLED";
      changedWord = "annulés";
    }
    const n = r.lines.length;
    const singleLabel = onlyMoved ? "Événement déplacé" : "Événement annulé";
    const title = n === 1 ? `${singleLabel} : ${r.titles[0]}` : `${n} événements ${changedWord}`;
    let tail = "";
    if (!r.lead) {
      if (onlyMoved) tail = " Vous êtes toujours planifié. Si vous ne pouvez plus servir, prévenez votre responsable.";
      else if (onlyCancelled) tail = n === 1 ? " Votre service est retiré de votre planning." : " Vos services sont retirés de votre planning.";
    }
    items.push({
      userId,
      type,
      title,
      message: `${r.lines.join(" ")}${tail}`,
      link: r.lead ? "/dashboard" : "/planning",
    });
  }
  return { items };
}

// ─── Points d'entrée ─────────────────────────────────────────────────────────

export async function collectEventChangeNotices(
  tx: Db,
  churchId: string,
  changes: EventChange[],
  opts: { actorId?: string | null; now?: Date }
): Promise<EventChangeNotices> {
  if (changes.length === 0) return emptyEventChangeNotices();
  const { audiences, leaders } = await loadEventAudience(tx, churchId, [...new Set(changes.map((c) => c.eventId))]);
  return buildEventChangeNotices(changes, audiences, leaders, { actorId: opts.actorId, now: opts.now ?? new Date() });
}

/** À appeler après validation de la transaction : une erreur d'envoi n'annule rien. */
export async function sendEventChangeNotices(notices: EventChangeNotices): Promise<{ notified: number }> {
  if (notices.items.length === 0) return { notified: 0 };
  const { createNotification } = await import("@/lib/notifications");
  let notified = 0;
  for (const item of notices.items) {
    try {
      await createNotification({ ...item, domain: "planning" });
      notified += 1;
    } catch (error) {
      console.error("[event-change-notices] envoi impossible", item.userId, error);
    }
  }
  return { notified };
}
