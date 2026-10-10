import { formatServiceDate } from "./rules";

/**
 * Notifications du désistement (spec 061), envoyées **hors transaction** et immédiatement — un
 * désistement est urgent, il n'attend pas le regroupement de la spec 060. `notifyUsers` écrit la
 * notification dans l'application puis délègue l'email aux préférences de chacun (spec 053).
 * `@/lib/notifications` est importé à l'usage pour que l'index du module reste importable dans les
 * tests.
 */

export const WITHDRAWAL_TYPES = {
  created: "SERVICE_WITHDRAWAL",
  cancelled: "SERVICE_WITHDRAWAL_CANCELLED",
  relance: "SERVICE_WITHDRAWAL_RELANCE",
  replaced: "SERVICE_WITHDRAWAL_REPLACED",
  closed: "SERVICE_WITHDRAWAL_CLOSED",
  byAbsence: "SERVICE_WITHDRAWAL_BY_ABSENCE",
  kept: "SERVICE_WITHDRAWAL_KEPT",
} as const;

const STAR_LINK = "/planning";
export const withdrawalLink = (id: string) => `/planning/remplacements/${id}`;

export interface WithdrawalNotice {
  withdrawalId: string;
  eventId: string;
  eventDate: Date;
  departmentName: string;
  memberName: string;
}

function candidatesText(count: number): string {
  if (count === 0) return "aucun membre disponible ni « si besoin » libre ce jour-là";
  return count === 1 ? "1 remplaçant possible" : `${count} remplaçants possibles`;
}

async function send(
  userIds: string[],
  n: WithdrawalNotice,
  type: string,
  title: string,
  message: string,
  link: string
): Promise<void> {
  if (userIds.length === 0) return;
  const { notifyUsers } = await import("@/lib/notifications");
  await notifyUsers(userIds, {
    domain: "planning",
    type,
    title,
    message,
    link,
    entityType: "ServiceWithdrawal",
    entityId: n.withdrawalId,
  });
}

/** Aux responsables : « Paul ne peut plus servir le dimanche 12 (Choristes) — 3 remplaçants possibles ». */
export function notifyWithdrawal(
  recipients: string[],
  n: WithdrawalNotice & { candidateCount: number; message: string | null }
): Promise<void> {
  const base = `${n.memberName} ne peut plus servir le ${formatServiceDate(n.eventDate)} (${n.departmentName}) — ${candidatesText(n.candidateCount)}.`;
  return send(
    recipients,
    n,
    WITHDRAWAL_TYPES.created,
    "Service à remplacer",
    n.message ? `${base} Son message : « ${n.message} »` : base,
    withdrawalLink(n.withdrawalId)
  );
}

/** Relance unique 48 h avant l'événement, nombre de candidats recalculé. */
export function notifyWithdrawalRelance(recipients: string[], n: WithdrawalNotice & { candidateCount: number }): Promise<void> {
  return send(
    recipients,
    n,
    WITHDRAWAL_TYPES.relance,
    "Service toujours à remplacer",
    `Le service de ${n.memberName} le ${formatServiceDate(n.eventDate)} (${n.departmentName}) est toujours à remplacer — ${candidatesText(n.candidateCount)}.`,
    withdrawalLink(n.withdrawalId)
  );
}

/** Aux responsables : « Paul peut finalement servir le dimanche 12 ». */
export function notifyWithdrawalCancelled(recipients: string[], n: WithdrawalNotice): Promise<void> {
  return send(
    recipients,
    n,
    WITHDRAWAL_TYPES.cancelled,
    "Désistement annulé",
    `${n.memberName} peut finalement servir le ${formatServiceDate(n.eventDate)} (${n.departmentName}).`,
    withdrawalLink(n.withdrawalId)
  );
}

/** Au STAR désisté : « Léa te remplace le dimanche 12 ». */
export function notifyWithdrawalReplaced(starUserIds: string[], n: WithdrawalNotice & { replacementName: string }): Promise<void> {
  return send(
    starUserIds,
    n,
    WITHDRAWAL_TYPES.replaced,
    "Tu es remplacé(e)",
    `${n.replacementName} te remplace le ${formatServiceDate(n.eventDate)} (${n.departmentName}).`,
    STAR_LINK
  );
}

/** Au STAR désisté, quand le responsable décide de ne pas le remplacer. */
export function notifyWithdrawalClosed(starUserIds: string[], n: WithdrawalNotice): Promise<void> {
  return send(
    starUserIds,
    n,
    WITHDRAWAL_TYPES.closed,
    "Désistement pris en compte",
    `Ton désistement du ${formatServiceDate(n.eventDate)} (${n.departmentName}) est pris en compte.`,
    STAR_LINK
  );
}

/** Service touché par une période d'absence (spec 062), pour les messages regroupés au STAR. */
export interface AbsenceServiceLine {
  eventDate: Date;
  departmentName: string;
  /** Pour un service conservé : nom du remplaçant, ou `null` si le responsable n'a pas remplacé. */
  replacementName?: string | null;
}

const serviceList = (lines: AbsenceServiceLine[]) =>
  lines.map((l) => `le ${formatServiceDate(l.eventDate)} (${l.departmentName})`).join(", ");

async function sendToStar(userIds: string[], absenceId: string, type: string, title: string, message: string) {
  if (userIds.length === 0) return;
  const { notifyUsers } = await import("@/lib/notifications");
  await notifyUsers(userIds, { domain: "planning", type, title, message, link: STAR_LINK, entityType: "Absence", entityId: absenceId });
}

/** Au STAR, quand un tiers déclare sa période : la liste des services dont il est retiré. */
export function notifyWithdrawnByAbsence(starUserIds: string[], absenceId: string, lines: AbsenceServiceLine[]): Promise<void> {
  const plural = lines.length > 1;
  return sendToStar(
    starUserIds,
    absenceId,
    WITHDRAWAL_TYPES.byAbsence,
    plural ? "Tu es retiré(e) de services" : "Tu es retiré(e) d'un service",
    `Ton indisponibilité a été enregistrée : tu es retiré(e) ${plural ? "des services" : "du service"} ${serviceList(lines)}. Tes responsables vont te remplacer.`
  );
}

/** Au STAR, à l'annulation ou au raccourcissement de sa période : services déjà pourvus ou clos. */
export function notifyWithdrawalsKept(starUserIds: string[], absenceId: string, lines: AbsenceServiceLine[]): Promise<void> {
  const detail = lines
    .map((l) => `le ${formatServiceDate(l.eventDate)} (${l.departmentName}) : ${l.replacementName ? `${l.replacementName} te remplace` : "pas de remplacement"}`)
    .join(" ; ");
  return sendToStar(
    starUserIds,
    absenceId,
    WITHDRAWAL_TYPES.kept,
    "Services non replacés",
    `Ton indisponibilité a changé, mais tu n'es pas replacé(e) sur ${lines.length > 1 ? "ces services, déjà traités" : "ce service, déjà traité"} — ${detail}.`
  );
}
