import type { Session } from "next-auth";
import { boundedAnswer, type AssistantViewer, type DataAnswerItem } from "@/core/assistant";
import { getUserDepartmentScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from "@/lib/request-queue";
import { anonymize } from "@/modules/assistant";
import {
  PLANNED_STATUSES,
  absenceVisibilityWhere,
  getPlanningAvailability,
  listMemberAvailability,
  listTeamEventsForMember,
  loadRequestQueue,
  resolveRequestQueueAccess,
} from "@/modules/planning";
import { loadMyPlanning } from "@/app/(auth)/planning/my-planning-data";
import { loadMyRequests } from "@/app/(auth)/requests/my-requests-data";
import {
  REFUSED,
  SERVICE_STATUS_LABEL,
  can,
  dayWindow,
  formatDay,
  formatMonth,
  formatTime,
  fullName,
  hasPredicate,
  isOnDay,
  monthRange,
  paramsSchema,
  startOfToday,
  today,
  type DataQuestion,
} from "./common";

/**
 * Questions de données du planning (D01–D07, D09, D11–D17). Les réponses personnelles relisent
 * les chargeurs des écrans (« Mon planning », « Mes demandes ») ; les réponses d'équipe passent
 * par le périmètre de départements de la grille (`getUserDepartmentScope`), comme `/dashboard`.
 */

/** Fiche STAR liée au compte dans l'église, comme « Mon planning » et la navigation. */
async function linkedMemberId(userId: string, churchId: string): Promise<string | null> {
  const link = await prisma.memberUserLink.findUnique({
    where: { userId_churchId: { userId, churchId } },
    select: { memberId: true },
  });
  return link?.memberId ?? null;
}

/** Fiches liées **validées**, comme l'écran « Disponibilités ». */
async function validatedMemberIds(userId: string, churchId: string): Promise<string[]> {
  const links = await prisma.memberUserLink.findMany({
    where: { userId, churchId, validatedAt: { not: null } },
    select: { memberId: true },
  });
  return links.map((l) => l.memberId);
}

const NO_LINK = "Votre compte n'est pas encore lié à une fiche STAR : ouvrez « Mon profil » pour demander la liaison.";

/** Départements du périmètre de la grille, sans les départements système. */
async function scopedDepartmentIds(session: Session, churchId: string): Promise<string[] | null> {
  const scope = getUserDepartmentScope(session, churchId);
  return scope.scoped ? scope.departmentIds : null;
}

function departmentFilter(departmentIds: string[] | null) {
  return departmentIds === null ? {} : { id: { in: departmentIds } };
}

/** Événements de l'église un jour donné (ou, sans jour, le prochain jour d'événement). */
async function eventsOnDay(churchId: string, day: string | undefined, now: Date) {
  let target = day;
  if (!target) {
    const next = await prisma.event.findFirst({
      where: { churchId, isRecurrenceParent: false, date: { gte: startOfToday(now) } },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    if (!next) return { day: null, events: [] };
    target = today(next.date);
  }
  const window = dayWindow(target);
  const events = await prisma.event.findMany({
    where: { churchId, isRecurrenceParent: false, date: { gte: window.from, lt: window.to } },
    select: { id: true, title: true, date: true },
    orderBy: { date: "asc" },
  });
  return { day: target, events: events.filter((e) => isOnDay(e.date, target)) };
}

function personal(viewer: AssistantViewer) {
  return hasPredicate(viewer, "linkedStar");
}

export const PLANNING_QUESTIONS: DataQuestion[] = [
  {
    key: "planning.myNextService",
    description: "Prochain service de la personne : date, événement, département (« Mon planning »).",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!personal(viewer)) return REFUSED;
      const data = await loadMyPlanning(viewer.userId, churchId);
      const base = { title: "Mon prochain service", href: "/planning", hrefLabel: "Mon planning" };
      if (!data) return boundedAnswer({ ...base, items: [], empty: NO_LINK });
      const from = startOfToday();
      const next = data.plannings
        .filter((p) => p.eventDepartment.event.date >= from)
        .sort((a, b) => a.eventDepartment.event.date.getTime() - b.eventDepartment.event.date.getTime());
      const first = next[0];
      const items: DataAnswerItem[] = first
        ? next
            .filter((p) => p.eventDepartment.event.id === first.eventDepartment.event.id)
            .map((p) => ({
              label: `${formatDay(p.eventDepartment.event.date)} · ${p.eventDepartment.event.title}`,
              detail: `${p.eventDepartment.department.name} · ${SERVICE_STATUS_LABEL[p.status ?? ""] ?? "En service"}`,
            }))
        : [];
      return boundedAnswer({ ...base, items, empty: "Vous n'avez aucun service à venir." });
    },
  },
  {
    key: "planning.myServicesMonth",
    description: "Services de la personne pour un mois (paramètre `month`, défaut : mois courant).",
    params: paramsSchema,
    async run({ viewer, churchId, params }) {
      if (!personal(viewer)) return REFUSED;
      const month = params.month ?? today().slice(0, 7);
      const base = { title: `Mes services · ${formatMonth(month)}`, href: "/planning", hrefLabel: "Mon planning" };
      const data = await loadMyPlanning(viewer.userId, churchId);
      if (!data) return boundedAnswer({ ...base, items: [], empty: NO_LINK });
      const { from, to } = monthRange(month);
      const items = data.plannings
        .filter((p) => p.eventDepartment.event.date >= from && p.eventDepartment.event.date < to)
        .sort((a, b) => a.eventDepartment.event.date.getTime() - b.eventDepartment.event.date.getTime())
        .map((p) => ({
          label: `${formatDay(p.eventDepartment.event.date)} · ${p.eventDepartment.event.title}`,
          detail: p.eventDepartment.department.name,
        }));
      return boundedAnswer({ ...base, items, empty: `Vous n'avez pas de service en ${formatMonth(month)}.` });
    },
  },
  {
    key: "planning.myUnavailabilities",
    description: "Périodes d'indisponibilité et réponses « Pas disponible » à venir de la personne.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!personal(viewer)) return REFUSED;
      const base = { title: "Mes indisponibilités", href: "/disponibilites", hrefLabel: "Disponibilités" };
      const memberIds = await validatedMemberIds(viewer.userId, churchId);
      if (memberIds.length === 0) return boundedAnswer({ ...base, items: [], empty: NO_LINK });
      const from = startOfToday();
      const [absences, responses] = await Promise.all([
        prisma.absence.findMany({
          where: {
            churchId,
            memberId: { in: memberIds },
            status: "ACTIVE",
            OR: [{ endDate: { gte: from } }, { kind: "EVENTS", targetEvents: { some: { eventDate: { gte: from } } } }],
          },
          select: { startDate: true, endDate: true, kind: true, targetEvents: { select: { eventTitle: true, eventDate: true } } },
          orderBy: { startDate: "asc" },
        }),
        prisma.availabilityResponse.findMany({
          where: { memberId: { in: memberIds }, answer: "UNAVAILABLE", event: { churchId, date: { gte: from } } },
          select: { event: { select: { id: true, title: true, date: true } } },
          orderBy: { event: { date: "asc" } },
        }),
      ]);
      const items: DataAnswerItem[] = [
        ...absences.map((a) =>
          a.kind === "PERIOD" && a.startDate && a.endDate
            ? { label: `Du ${formatDay(a.startDate)} au ${formatDay(a.endDate)}`, detail: "Période d'absence" }
            : {
                label: a.targetEvents.map((e) => (e.eventDate ? formatDay(e.eventDate) : e.eventTitle)).join(", ") || "Événements précis",
                detail: "Absence sur des événements précis",
              }
        ),
        ...[...new Map(responses.map((r) => [r.event.id, r.event])).values()].map((e) => ({
          label: `${formatDay(e.date)} · ${e.title}`,
          detail: "Réponse « Pas disponible »",
        })),
      ];
      return boundedAnswer({ ...base, items, empty: "Vous n'avez déclaré aucune indisponibilité à venir." });
    },
  },
  {
    key: "planning.myCollection",
    description: "Collectes de disponibilités ouvertes : date limite et événements encore sans réponse.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!personal(viewer)) return REFUSED;
      const base = { title: "Ma collecte de disponibilités", href: "/disponibilites", hrefLabel: "Disponibilités" };
      const memberIds = await validatedMemberIds(viewer.userId, churchId);
      if (memberIds.length === 0) return boundedAnswer({ ...base, items: [], empty: NO_LINK });
      const now = new Date();
      const current = await listMemberAvailability(memberIds[0], churchId, now, now);
      const openMonths = current.months.filter((m) => m.open);
      const items: DataAnswerItem[] = [];
      for (const month of openMonths) {
        let missing = 0;
        for (const memberId of memberIds) {
          const availability = await listMemberAvailability(memberId, churchId, month.month, now);
          missing += availability.events.filter((e) => e.departments.some((d) => d.state === "NO_RESPONSE")).length;
        }
        const label = `Collecte de ${formatMonth(month.month.toISOString().slice(0, 7))}`;
        const deadline = month.closesAt ? ` · date limite ${formatDay(month.closesAt)}` : "";
        items.push({
          label,
          detail: missing === 0 ? `Tout est répondu${deadline}` : `${missing} événement${missing > 1 ? "s" : ""} sans réponse${deadline}`,
        });
      }
      return boundedAnswer({ ...base, items, empty: "Aucune collecte de disponibilités n'est ouverte en ce moment." });
    },
  },
  {
    key: "planning.myReplacements",
    description: "Désistements de la personne : remplaçant choisi (nom seulement) ou en attente.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!personal(viewer)) return REFUSED;
      const base = { title: "Mes services remplacés", href: "/planning", hrefLabel: "Mon planning" };
      const memberId = await linkedMemberId(viewer.userId, churchId);
      if (!memberId) return boundedAnswer({ ...base, items: [], empty: NO_LINK });
      const withdrawals = await prisma.serviceWithdrawal.findMany({
        where: { churchId, memberId, status: { in: ["PENDING", "REPLACED"] }, event: { date: { gte: startOfToday() } } },
        select: {
          status: true,
          event: { select: { title: true, date: true } },
          department: { select: { name: true } },
          replacementMember: { select: { firstName: true, lastName: true } },
        },
        orderBy: { event: { date: "asc" } },
      });
      const items = withdrawals.map((w) => ({
        label: `${formatDay(w.event.date)} · ${w.event.title} (${w.department.name})`,
        detail:
          w.status === "REPLACED" && w.replacementMember
            ? `Remplacé par ${fullName(w.replacementMember)}`
            : "En attente d'un remplaçant",
      }));
      return boundedAnswer({ ...base, items, empty: "Vous n'avez aucun désistement à venir." });
    },
  },
  {
    key: "planning.instructions",
    description: "Consignes des départements du périmètre pour le prochain événement (vue Planning).",
    params: paramsSchema,
    async run({ viewer, session, churchId }) {
      if (!can(viewer, "planning:department")) return REFUSED;
      const base = { title: "Consignes du prochain événement", href: "/dashboard", hrefLabel: "Planning" };
      const departmentIds = await scopedDepartmentIds(session, churchId);
      if (departmentIds?.length === 0) return boundedAnswer({ ...base, items: [], empty: "Aucun département dans votre périmètre." });
      const notices = await prisma.departmentNotice.findMany({
        where: {
          event: { churchId, date: { gte: startOfToday() } },
          department: { ...departmentFilter(departmentIds), ministry: { churchId } },
        },
        select: { content: true, department: { select: { name: true } }, event: { select: { id: true, title: true, date: true } } },
        orderBy: { event: { date: "asc" } },
        take: 30,
      });
      const firstEvent = notices[0]?.event.id;
      const items = notices
        .filter((n) => n.event.id === firstEvent)
        .map((n) => ({
          label: `${n.department.name} · ${formatDay(n.event.date)} ${n.event.title}`,
          // Texte libre : liens, emails et numéros masqués avant d'être recopiés.
          detail: anonymize(n.content, 200),
        }));
      return boundedAnswer({ ...base, items, empty: "Aucune consigne pour les prochains événements." });
    },
  },
  {
    key: "planning.myTeamEvents",
    description: "Prochains événements d'équipe (répétitions, réunions) des départements de la personne.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!personal(viewer)) return REFUSED;
      const base = { title: "Mes événements d'équipe", href: "/planning", hrefLabel: "Mon planning" };
      const memberId = await linkedMemberId(viewer.userId, churchId);
      if (!memberId) return boundedAnswer({ ...base, items: [], empty: NO_LINK });
      const now = new Date();
      const events = (await listTeamEventsForMember(churchId, memberId))
        .filter((e) => e.endsAt >= now)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      const items = events.map((e) => ({
        label: `${formatDay(e.startsAt)} ${formatTime(e.startsAt)} · ${e.title}`,
        detail: e.department.name,
      }));
      return boundedAnswer({ ...base, items, empty: "Aucun événement d'équipe à venir." });
    },
  },
  {
    key: "planning.myPendingRequests",
    description: "Demandes de la personne encore ouvertes (« Mes demandes ») et leur statut.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "members:view")) return REFUSED;
      const requests = (await loadMyRequests(viewer.userId, churchId)).filter(
        (r) => r.status === "EN_ATTENTE" || r.status === "EN_COURS"
      );
      const items = requests.map((r) => ({
        label: anonymize(r.announcement?.title ?? REQUEST_TYPE_LABEL[r.type] ?? r.type, 120),
        detail: `${REQUEST_TYPE_LABEL[r.type] ?? r.type} · ${REQUEST_STATUS_LABEL[r.status] ?? r.status}`,
      }));
      return boundedAnswer({
        title: "Mes demandes en cours",
        href: "/requests",
        hrefLabel: "Mes demandes",
        items,
        empty: "Vous n'avez aucune demande en cours.",
      });
    },
  },
  {
    key: "planning.servingOnDay",
    description: "STAR en service un jour donné (`day`, défaut : prochain jour d'événement), par département du périmètre.",
    params: paramsSchema,
    async run({ viewer, session, churchId, params }) {
      if (!can(viewer, "planning:department")) return REFUSED;
      const departmentIds = await scopedDepartmentIds(session, churchId);
      const { day, events } = await eventsOnDay(churchId, params.day, new Date());
      const base = { title: day ? `En service · ${formatDay(new Date(`${day}T12:00:00Z`))}` : "En service", href: "/dashboard", hrefLabel: "Planning" };
      if (events.length === 0 || departmentIds?.length === 0) return boundedAnswer({ ...base, items: [], empty: "Aucun service prévu ce jour-là dans votre périmètre." });
      const plannings = await prisma.planning.findMany({
        where: {
          status: { in: [...PLANNED_STATUSES] },
          eventDepartment: {
            eventId: { in: events.map((e) => e.id) },
            department: { ...departmentFilter(departmentIds), isSystem: false },
          },
        },
        select: {
          status: true,
          member: { select: { firstName: true, lastName: true } },
          eventDepartment: { select: { department: { select: { name: true } }, event: { select: { title: true } } } },
        },
        orderBy: [{ eventDepartment: { department: { name: "asc" } } }, { member: { lastName: "asc" } }],
      });
      const items = plannings.map((p) => ({
        label: fullName(p.member),
        detail: `${p.eventDepartment.department.name} · ${SERVICE_STATUS_LABEL[p.status ?? ""] ?? ""}${events.length > 1 ? ` · ${p.eventDepartment.event.title}` : ""}`,
      }));
      return boundedAnswer({ ...base, items, empty: "Personne n'est encore en service ce jour-là dans votre périmètre." });
    },
  },
  {
    key: "planning.unavailableOnDay",
    description: "STAR indisponibles et sans réponse un jour donné, par département du périmètre (disponibilités de la grille).",
    params: paramsSchema,
    async run({ viewer, session, churchId, params }) {
      if (!can(viewer, "planning:department")) return REFUSED;
      const departmentIds = await scopedDepartmentIds(session, churchId);
      const { day, events } = await eventsOnDay(churchId, params.day, new Date());
      const base = { title: day ? `Indisponibles · ${formatDay(new Date(`${day}T12:00:00Z`))}` : "Indisponibles", href: "/dashboard", hrefLabel: "Planning" };
      if (events.length === 0 || departmentIds?.length === 0) return boundedAnswer({ ...base, items: [], empty: "Aucun événement ce jour-là dans votre périmètre." });
      const eventDepts = await prisma.eventDepartment.findMany({
        where: { eventId: { in: events.map((e) => e.id) }, department: { ...departmentFilter(departmentIds), isSystem: false } },
        select: {
          departmentId: true,
          department: { select: { name: true, memberDepts: { select: { member: { select: { id: true, firstName: true, lastName: true } } } } } },
          event: { select: { id: true, date: true } },
        },
      });
      const items: DataAnswerItem[] = [];
      for (const ed of eventDepts) {
        const members = ed.department.memberDepts.map((m) => m.member);
        const grid = await getPlanningAvailability(churchId, ed.event, ed.departmentId, members.map((m) => m.id));
        for (const member of members) {
          const state = grid.members.get(member.id);
          if (!state) continue;
          if (state.state === "UNAVAILABLE") items.push({ label: fullName(member), detail: `${ed.department.name} · Indisponible` });
          else if (state.state === "NO_RESPONSE") items.push({ label: fullName(member), detail: `${ed.department.name} · Sans réponse` });
        }
      }
      items.sort((a, b) => (a.detail ?? "").localeCompare(b.detail ?? "") || a.label.localeCompare(b.label));
      return boundedAnswer({ ...base, items, empty: "Personne n'est indisponible ce jour-là dans votre périmètre." });
    },
  },
  {
    key: "planning.toReplace",
    description: "Services « À remplacer » (désistements en attente) des départements du périmètre.",
    params: paramsSchema,
    async run({ viewer, session, churchId }) {
      if (!can(viewer, "planning:edit")) return REFUSED;
      const departmentIds = await scopedDepartmentIds(session, churchId);
      const base = { title: "Services à remplacer", href: "/dashboard", hrefLabel: "Planning" };
      if (departmentIds?.length === 0) return boundedAnswer({ ...base, items: [], empty: "Aucun département dans votre périmètre." });
      const withdrawals = await prisma.serviceWithdrawal.findMany({
        where: {
          churchId,
          status: "PENDING",
          event: { date: { gte: new Date() } },
          ...(departmentIds === null ? {} : { departmentId: { in: departmentIds } }),
        },
        select: {
          event: { select: { title: true, date: true } },
          department: { select: { name: true } },
          member: { select: { firstName: true, lastName: true } },
        },
        orderBy: { event: { date: "asc" } },
      });
      const items = withdrawals.map((w) => ({
        label: `${formatDay(w.event.date)} · ${w.event.title} (${w.department.name})`,
        detail: `${fullName(w.member)} s'est désisté`,
      }));
      return boundedAnswer({ ...base, items, empty: "Aucun service à remplacer dans votre périmètre." });
    },
  },
  {
    key: "planning.teamUnavailabilities",
    description: "Périodes d'absence du périmètre pour un mois (`month`, défaut : mois courant).",
    params: paramsSchema,
    async run({ viewer, session, churchId, params }) {
      if (!can(viewer, "absences:view")) return REFUSED;
      const month = params.month ?? today().slice(0, 7);
      const base = { title: `Absences · ${formatMonth(month)}`, href: "/disponibilites", hrefLabel: "Disponibilités" };
      const departmentIds = await scopedDepartmentIds(session, churchId);
      if (departmentIds?.length === 0) return boundedAnswer({ ...base, items: [], empty: "Aucun département dans votre périmètre." });
      const { from, to } = monthRange(month);
      const absences = await prisma.absence.findMany({
        where: {
          churchId,
          status: "ACTIVE",
          kind: "PERIOD",
          startDate: { lt: to },
          endDate: { gte: from },
          ...(departmentIds === null ? {} : { AND: [absenceVisibilityWhere(departmentIds)] }),
        },
        select: { startDate: true, endDate: true, member: { select: { firstName: true, lastName: true } } },
        orderBy: { startDate: "asc" },
      });
      const items = absences.map((a) => ({
        label: fullName(a.member),
        detail: a.startDate && a.endDate ? `Du ${formatDay(a.startDate)} au ${formatDay(a.endDate)}` : "Période d'absence",
      }));
      return boundedAnswer({ ...base, items, empty: `Aucune absence en ${formatMonth(month)} dans votre périmètre.` });
    },
  },
  {
    key: "planning.eventsThisWeek",
    description: "Événements de l'église des 7 prochains jours.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "events:view")) return REFUSED;
      const from = startOfToday();
      const to = new Date(from.getTime() + 7 * 86_400_000);
      const events = await prisma.event.findMany({
        where: { churchId, isRecurrenceParent: false, date: { gte: from, lt: to } },
        select: { title: true, date: true, type: true },
        orderBy: { date: "asc" },
      });
      const items = events.map((e) => ({ label: `${formatDay(e.date)} ${formatTime(e.date)} · ${e.title}`, detail: e.type }));
      return boundedAnswer({
        title: "Événements de la semaine",
        href: "/events",
        hrefLabel: "Agenda de l'église",
        items,
        empty: "Aucun événement dans les 7 prochains jours.",
      });
    },
  },
  {
    key: "planning.secretariatPending",
    description: "Demandes ouvertes de la file du Secrétariat, par type, en retard d'abord.",
    params: paramsSchema,
    async run({ viewer, session, churchId }) {
      if (!can(viewer, "planning:view")) return REFUSED;
      const access = await resolveRequestQueueAccess(session, churchId, "SECRETARIAT");
      if (!access.allowed) return REFUSED;
      const queue = await loadRequestQueue(churchId, "SECRETARIAT");
      const day = today();
      const byType = new Map<string, { count: number; late: number }>();
      for (const item of queue.open) {
        const row = byType.get(item.type) ?? { count: 0, late: 0 };
        row.count++;
        if (item.deadline && item.deadline.slice(0, 10) < day) row.late++;
        byType.set(item.type, row);
      }
      const items = [...byType.entries()]
        .sort((a, b) => b[1].late - a[1].late || b[1].count - a[1].count)
        .map(([type, row]) => ({
          label: `${REQUEST_TYPE_LABEL[type] ?? type} : ${row.count}`,
          detail: row.late > 0 ? `${row.late} en retard` : "Aucune en retard",
        }));
      return boundedAnswer({
        title: "Demandes à traiter",
        href: "/secretariat/requests",
        hrefLabel: "Traitement des demandes",
        items,
        total: queue.open.length,
        empty: "Aucune demande en attente.",
      });
    },
  },
  {
    key: "planning.missingReports",
    description: "Événements passés des 90 derniers jours, ouverts aux comptes rendus, sans compte rendu.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "reports:view")) return REFUSED;
      const now = new Date();
      const events = await prisma.event.findMany({
        where: {
          churchId,
          reportEnabled: true,
          report: null,
          date: { lt: now, gte: new Date(now.getTime() - 90 * 86_400_000) },
        },
        select: { title: true, date: true },
        orderBy: { date: "desc" },
      });
      const items = events.map((e) => ({ label: `${formatDay(e.date)} · ${e.title}` }));
      return boundedAnswer({
        title: "Comptes rendus manquants",
        href: "/admin/reports",
        hrefLabel: "Comptes rendus",
        items,
        empty: "Tous les événements récents ont leur compte rendu.",
      });
    },
  },
];
