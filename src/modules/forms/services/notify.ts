import { sendEmail } from "@/lib/email";
import { createNotification, notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { displayValue } from "./engine";
import type { FormWithQuestions } from "./builder";

/**
 * Notifications des formulaires (spec 079), domaine `forms`.
 *
 * - **Accusé de réception** : à un compte par `createNotification` (préférence appliquée) ; à une
 *   personne sans compte (formulaire public) par `sendEmail` direct — liste blanche « destinataire
 *   sans compte » (spec 053). Jamais pour un sondage anonyme.
 * - **Signal au secrétariat** : regroupé par la tâche planifiée, sans aucun nom (écran verrouillé,
 *   spec 068).
 */

export function appUrl(): string {
  return process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

export const manageUrl = (token: string) => `${appUrl()}/f/reponse/${token}`;
export const formPath = (churchSlug: string, formSlug: string) => `/f/${churchSlug}/${formSlug}`;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function layout(title: string, churchName: string, body: string): string {
  return `
    <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">${esc(title)}</h1>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">${esc(churchName)}</p>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; color: #111827;">
        ${body}
        <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
          Vous recevez cet email parce que vous avez répondu à ce formulaire. Ne transférez pas le lien
          « Gérer ma réponse » : il permet de la modifier et de l'annuler.
        </p>
      </div>
    </div>`;
}

const button = (url: string, label: string) =>
  `<p style="margin: 20px 0;"><a href="${esc(url)}" style="background: #5E17EB; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: 600;">${esc(label)}</a></p>`;

/** Récapitulatif des réponses (pour la personne elle-même). */
function recap(form: FormWithQuestions, answers: Map<string, unknown>): string {
  const rows = form.questions
    .filter((q) => answers.has(q.id))
    .map((q) => `<tr><td style="padding: 4px 12px 4px 0; color: #6b7280; vertical-align: top;">${esc(q.label)}</td><td style="padding: 4px 0;">${esc(displayValue(q, answers.get(q.id)))}</td></tr>`)
    .join("");
  return rows ? `<table style="border-collapse: collapse; font-size: 14px;">${rows}</table>` : "";
}

interface ReceiptInput {
  form: FormWithQuestions & { church: { name: string; slug: string } };
  responseId: string;
  status: "CONFIRMED" | "WAITLISTED";
  userId: string | null;
  contactEmail: string | null;
  manageToken: string | null;
  answers: Map<string, unknown>;
}

/** Accusé de réception, après la transaction. Une erreur d'envoi ne fait jamais échouer la réponse. */
export async function sendReceipt(input: ReceiptInput): Promise<void> {
  const { form } = input;
  if (form.anonymous) return;
  const waiting = input.status === "WAITLISTED";
  const headline = waiting
    ? "Votre réponse est enregistrée en liste d'attente : vous serez prévenu(e) si une place se libère."
    : "Votre réponse est bien enregistrée.";
  try {
    if (input.userId) {
      await createNotification(
        {
          userId: input.userId,
          domain: "forms",
          type: "FORM_RECEIPT",
          title: `Réponse enregistrée : ${form.title}`,
          message: headline,
          link: formPath(form.church.slug, form.slug),
          entityType: "FormResponse",
          entityId: input.responseId,
        }
      );
      return;
    }
    if (!input.contactEmail || !input.manageToken) return;
    await sendEmail({
      to: input.contactEmail,
      subject: `${form.title} — réponse enregistrée`,
      html: layout(
        form.title,
        form.church.name,
        `<p>${esc(headline)}</p>${recap(form, input.answers)}${button(manageUrl(input.manageToken), "Gérer ma réponse")}`
      ),
    });
  } catch (error) {
    logger.error({ err: error, formId: form.id }, "Accusé de réception d'un formulaire non envoyé");
  }
}

/**
 * Doublon sur un formulaire public : le lien de gestion de la réponse existante est renvoyé à
 * l'adresse (jamais affiché à qui l'a saisie).
 */
export async function resendManageLink(
  form: { title: string; church: { name: string } },
  contactEmail: string,
  token: string
): Promise<void> {
  try {
    await sendEmail({
      to: contactEmail,
      subject: `${form.title} — votre réponse`,
      html: layout(
        form.title,
        form.church.name,
        `<p>Une réponse à ce formulaire existe déjà pour cette adresse. Vous pouvez la consulter, la modifier ou l'annuler :</p>${button(manageUrl(token), "Gérer ma réponse")}`
      ),
    });
  } catch (error) {
    logger.error({ err: error }, "Renvoi du lien de gestion d'un formulaire non envoyé");
  }
}

/**
 * Signal regroupé au secrétariat : « N nouvelle(s) réponse(s) » par formulaire depuis le dernier
 * signal. Destinataire : l'auteur du formulaire, à défaut les Admins et Secrétaires de l'église.
 */
export async function signalNewResponses(): Promise<number> {
  const forms = await prisma.form.findMany({
    where: { deletedAt: null, purgedAt: null, status: { in: ["PUBLISHED", "CLOSED"] } },
    select: { id: true, churchId: true, title: true, createdById: true, notifiedCount: true, _count: { select: { responses: true } } },
  });
  let signalled = 0;
  for (const form of forms) {
    const fresh = form._count.responses - form.notifiedCount;
    if (fresh <= 0) continue;
    // Prise atomique : un seul passage signale ces réponses.
    const taken = await prisma.form.updateMany({
      where: { id: form.id, notifiedCount: form.notifiedCount },
      data: { notifiedCount: form._count.responses },
    });
    if (taken.count === 0) continue;
    let recipients = form.createdById ? [form.createdById] : [];
    if (recipients.length === 0) {
      const roles = await prisma.userChurchRole.findMany({
        where: { churchId: form.churchId, role: { in: ["ADMIN", "SECRETARY"] } },
        select: { userId: true },
      });
      recipients = [...new Set(roles.map((r) => r.userId))];
    }
    await notifyUsers(recipients, {
      domain: "forms",
      type: "FORM_NEW_RESPONSES",
      title: form.title,
      message: fresh > 1 ? `${fresh} nouvelles réponses` : "1 nouvelle réponse",
      link: `/formulaires/${form.id}?onglet=reponses`,
      entityType: "Form",
      entityId: form.id,
    });
    signalled += fresh;
  }
  return signalled;
}
