import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { sendEmail } from "@/lib/email";
import { notifyUsers } from "@/lib/notifications";
import { logger } from "@/lib/logger";
import type { CampaignAssignmentStatus } from "@/generated/prisma/client";
import { newSalt, respondentTokenPair } from "./tokens";

/**
 * Notifications des campagnes de collecte (spec 090), domaine `campaigns` (« Collectes »).
 *
 * - Comptes : `notifyUsers` (préférence email et notification native appliquées), lien
 *   `/collectes/r/<affectation>`.
 * - Répondant **sans compte** : `sendEmail` direct avec son lien personnel `/collecte/<jeton>` —
 *   liste blanche « destinataire sans compte » (spec 053) : aucune préférence à respecter, et
 *   c'est le seul moyen de lui remettre son lien.
 *
 * Contenu : titre de la campagne, questionnaire et destinataire, échéance, lien. **Jamais de
 * valeur saisie** (écran verrouillé, spec 068). Une erreur d'envoi ne fait jamais échouer
 * l'action qui notifie.
 */

const DOMAIN = "campaigns";
const REMIND_INTERVAL_MS = 24 * 3600_000;
const DUE_REMINDER_WINDOW_MS = 48 * 3600_000;
const OPEN_STATUSES: CampaignAssignmentStatus[] = ["NOT_STARTED", "IN_PROGRESS", "CHANGES_REQUESTED"];

function appUrl(): string {
  return process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

/** Lien personnel absolu d'un répondant sans compte, ou null s'il n'a pas (encore) de lien. */
export function respondentLink(respondent: { id: string; tokenSalt: string | null }): string | null {
  if (!respondent.tokenSalt) return null;
  return `${appUrl()}/collecte/${respondentTokenPair(respondent.id, respondent.tokenSalt).token}`;
}

/** Lien d'un sans-compte, créé s'il n'existe pas encore (premier envoi). */
export async function ensureRespondentLink(respondent: { id: string; tokenSalt: string | null }): Promise<string> {
  const existing = respondentLink(respondent);
  if (existing) return existing;
  const salt = newSalt();
  const { hash } = respondentTokenPair(respondent.id, salt);
  await prisma.campaignRespondent.update({ where: { id: respondent.id }, data: { tokenSalt: salt, tokenHash: hash } });
  return respondentLink({ id: respondent.id, tokenSalt: salt })!;
}

export const assignmentPath = (assignmentId: string) => `/collectes/r/${assignmentId}`;

const dayFr = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" });

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function emailLayout(title: string, churchName: string, paragraphs: string[], url: string, cta: string): string {
  return `
    <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">${esc(title)}</h1>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">${esc(churchName)}</p>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; color: #111827;">
        ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}
        <p style="margin: 20px 0;"><a href="${esc(url)}" style="background: #5E17EB; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: 600;">${esc(cta)}</a></p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
          Ce lien est personnel : il ouvre votre seul questionnaire. Ne le transférez pas.
        </p>
      </div>
    </div>`;
}

const ASSIGNMENT_SELECT = {
  id: true,
  label: true,
  status: true,
  dueAt: true,
  form: { select: { title: true } },
  campaign: { select: { id: true, title: true, status: true, dueAt: true, church: { select: { name: true } } } },
  respondents: { select: { id: true, userId: true, name: true, email: true, tokenSalt: true } },
} as const;

type LoadedAssignment = {
  id: string;
  label: string;
  status: CampaignAssignmentStatus;
  dueAt: Date | null;
  form: { title: string };
  campaign: { id: string; title: string; status: string; dueAt: Date | null; church: { name: string } };
  respondents: { id: string; userId: string | null; name: string | null; email: string | null; tokenSalt: string | null }[];
};

const dueOf = (a: Pick<LoadedAssignment, "dueAt" | "campaign">) => a.dueAt ?? a.campaign.dueAt;

/** « Questionnaire « Intégration » (Intégration) » : le destinataire n'est rappelé que s'il diffère. */
const subject = (a: LoadedAssignment) => (a.label === a.form.title ? `« ${a.form.title} »` : `« ${a.form.title} » (${a.label})`);

interface Message {
  type: string;
  title: string;
  /** Texte de la cloche et de l'email (sans valeur saisie). */
  message: string;
  cta: string;
}

/**
 * Envoie un message aux répondants d'une affectation : comptes par la cloche, sans-compte par
 * email avec leur lien. Renvoie le nombre de destinataires atteints.
 */
async function sendToRespondents(a: LoadedAssignment, msg: Message, only?: readonly string[]): Promise<number> {
  const respondents = only ? a.respondents.filter((r) => only.includes(r.id)) : a.respondents;
  const userIds = [...new Set(respondents.map((r) => r.userId).filter((id): id is string => !!id))];
  let sent = 0;
  if (userIds.length) {
    try {
      await notifyUsers(userIds, {
        domain: DOMAIN,
        type: msg.type,
        title: msg.title,
        message: msg.message,
        link: assignmentPath(a.id),
        entityType: "CampaignAssignment",
        entityId: a.id,
      });
      sent += userIds.length;
    } catch (error) {
      logger.error({ err: error, assignmentId: a.id }, "Notification de collecte non envoyée");
    }
  }
  for (const r of respondents) {
    if (r.userId || !r.email) continue;
    try {
      const url = await ensureRespondentLink(r);
      await sendEmail({
        to: r.email,
        subject: msg.title,
        html: emailLayout(a.campaign.title, a.campaign.church.name, [r.name ? `Bonjour ${r.name},` : "Bonjour,", msg.message], url, msg.cta),
      });
      sent++;
    } catch (error) {
      logger.error({ err: error, respondentId: r.id }, "Email de collecte à un répondant sans compte non envoyé");
    }
  }
  return sent;
}

function dueSentence(a: LoadedAssignment): string {
  const due = dueOf(a);
  return due ? ` Échéance : ${dayFr(due)}.` : "";
}

const openedMessage = (a: LoadedAssignment): Message => ({
  type: "CAMPAIGN_OPENED",
  title: `Collecte : ${a.campaign.title}`,
  message: `Le questionnaire ${subject(a)} vous attend.${dueSentence(a)}`,
  cta: "Remplir le questionnaire",
});

async function loadAssignment(assignmentId: string): Promise<LoadedAssignment | null> {
  return prisma.campaignAssignment.findUnique({ where: { id: assignmentId }, select: ASSIGNMENT_SELECT }) as Promise<LoadedAssignment | null>;
}

/** Ouverture d'une campagne : tous les répondants de toutes les affectations. */
export async function notifyCampaignOpened(campaignId: string): Promise<void> {
  const assignments = (await prisma.campaignAssignment.findMany({
    where: { campaignId },
    select: ASSIGNMENT_SELECT,
    orderBy: { position: "asc" },
  })) as LoadedAssignment[];
  for (const a of assignments) await sendToRespondents(a, openedMessage(a));
}

/** Répondant ajouté à une campagne **ouverte** : lui seul. Sans effet sinon. */
export async function notifyRespondentAdded(respondentId: string): Promise<void> {
  const r = await prisma.campaignRespondent.findUnique({ where: { id: respondentId }, select: { assignmentId: true } });
  if (!r) return;
  const a = await loadAssignment(r.assignmentId);
  if (!a || a.campaign.status !== "OPEN") return;
  await sendToRespondents(a, openedMessage(a), [respondentId]);
}

/**
 * Correction demandée : les répondants. Le motif n'est pas dans la notification (il peut citer
 * des chiffres) ; il s'affiche dans le questionnaire.
 */
export async function notifyChangesRequested(assignmentId: string, reason: string): Promise<void> {
  const a = await loadAssignment(assignmentId);
  if (!a) return;
  void reason;
  await sendToRespondents(a, {
    type: "CAMPAIGN_CHANGES_REQUESTED",
    title: `Correction demandée : ${a.campaign.title}`,
    message: `Une correction est demandée sur le questionnaire ${subject(a)} : le motif est indiqué dans le questionnaire, à nouveau modifiable.${dueSentence(a)}`,
    cta: "Voir la correction demandée",
  });
}

/**
 * Contribution rouverte (spec 091) : les répondants. Comme pour une correction, le motif n'est pas
 * dans la notification (il peut citer des chiffres) ; il s'affiche dans le questionnaire.
 */
export async function notifyAssignmentReopened(assignmentId: string, reason?: string | null): Promise<void> {
  const a = await loadAssignment(assignmentId);
  if (!a) return;
  await sendToRespondents(a, {
    type: "CAMPAIGN_REOPENED",
    title: `Questionnaire rouvert : ${a.campaign.title}`,
    message: `Le questionnaire ${subject(a)} a été rouvert : les réponses et fichiers déjà saisis sont conservés, et il doit être soumis de nouveau.${reason?.trim() ? " Le motif est indiqué dans le questionnaire." : ""}${dueSentence(a)}`,
    cta: "Reprendre le questionnaire",
  });
}

/**
 * Gestionnaires désignés **encore membres** de l'église de la campagne : un compte qui a quitté
 * l'église n'en reçoit plus rien (même règle que `isCampaignManager`).
 */
async function activeManagerIds(campaignId: string, churchId: string): Promise<string[]> {
  const rows = await prisma.campaignManager.findMany({
    where: { campaignId, user: { churchRoles: { some: { churchId } } } },
    select: { userId: true },
  });
  return rows.map((m) => m.userId);
}

/** Soumission : les gestionnaires désignés de la campagne (pas tous les Admins). */
export async function notifyAssignmentSubmitted(assignmentId: string): Promise<void> {
  const a = await prisma.campaignAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, label: true, campaignId: true, form: { select: { title: true } }, campaign: { select: { title: true, churchId: true } } },
  });
  if (!a) return;
  const userIds = await activeManagerIds(a.campaignId, a.campaign.churchId);
  if (userIds.length === 0) return;
  try {
    await notifyUsers(userIds, {
      domain: DOMAIN,
      type: "CAMPAIGN_SUBMITTED",
      title: `Questionnaire soumis : ${a.campaign.title}`,
      message: a.label === a.form.title ? `« ${a.form.title} » a été soumis.` : `« ${a.form.title} » (${a.label}) a été soumis.`,
      link: `/collectes/${a.campaignId}`,
      entityType: "CampaignAssignment",
      entityId: a.id,
    });
  } catch (error) {
    logger.error({ err: error, assignmentId }, "Notification de soumission non envoyée");
  }
}

const reminderMessage = (a: LoadedAssignment, type: string): Message => ({
  type,
  title: `Rappel — ${a.campaign.title}`,
  message: `Le questionnaire ${subject(a)} n'est pas encore soumis.${dueSentence(a)}`,
  cta: "Reprendre le questionnaire",
});

/**
 * Relance manuelle des répondants d'une affectation non soumise : au plus une fois par 24 h (429
 * sinon), prise de façon atomique sur `lastRemindedAt`.
 */
export async function remindAssignment(assignmentId: string): Promise<{ sent: number }> {
  const a = await loadAssignment(assignmentId);
  if (!a) throw new ApiError(404, "Questionnaire introuvable");
  if (a.campaign.status !== "OPEN") throw new ApiError(409, "La campagne n'est pas ouverte");
  if (!OPEN_STATUSES.includes(a.status)) throw new ApiError(409, "Ce questionnaire est déjà soumis");
  const now = new Date();
  const taken = await prisma.campaignAssignment.updateMany({
    where: { id: assignmentId, OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: new Date(now.getTime() - REMIND_INTERVAL_MS) } }] },
    data: { lastRemindedAt: now },
  });
  if (taken.count === 0) throw new ApiError(429, "Une relance a déjà été envoyée il y a moins de 24 h");
  return { sent: await sendToRespondents(a, reminderMessage(a, "CAMPAIGN_REMINDER")) };
}

/**
 * Relance automatique J-2 (tâche cron) : affectations non soumises d'une campagne ouverte dont
 * l'échéance (affectation, sinon campagne) tombe dans les 48 h, une seule fois
 * (`dueReminderSentAt`, pris de façon atomique). Renvoie le nombre d'affectations relancées.
 */
export async function runDueReminders(now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + DUE_REMINDER_WINDOW_MS);
  const candidates = (await prisma.campaignAssignment.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      dueReminderSentAt: null,
      campaign: { status: "OPEN" },
      OR: [
        { dueAt: { gt: now, lte: horizon } },
        { dueAt: null, campaign: { dueAt: { gt: now, lte: horizon } } },
      ],
    },
    select: ASSIGNMENT_SELECT,
  })) as LoadedAssignment[];
  let reminded = 0;
  for (const a of candidates) {
    const taken = await prisma.campaignAssignment.updateMany({ where: { id: a.id, dueReminderSentAt: null }, data: { dueReminderSentAt: now } });
    if (taken.count === 0) continue;
    await sendToRespondents(a, reminderMessage(a, "CAMPAIGN_DUE_REMINDER"));
    reminded++;
  }
  return reminded;
}
