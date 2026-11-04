import { sendEmail } from "@/lib/email";
import { formatEuros, PAYMENT_METHOD_LABEL, type PaymentInstructions } from "../schemas";
import type { Balances } from "./rules";

/**
 * Emails de la billetterie (spec 074), adressés au contact de la réservation.
 *
 * Le contact n'a souvent pas de compte : `sendEmail` direct (liste blanche « destinataire sans
 * compte », comme les formulaires publics). S'il a un compte (`userId`), la notification passe
 * par `createNotification` (domaine `ticketing`), qui respecte sa préférence d'email (spec 053).
 */

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function appUrl(): string {
  return process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

export const manageUrl = (token: string) => `${appUrl()}/reservation/${token}`;
export const ticketUrl = (token: string) => `${appUrl()}/billet/${token}`;

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});
export const formatDateTime = (d: Date) => DATE_FMT.format(d);

export interface MailEvent {
  title: string;
  startsAt: Date;
  location: string | null;
  churchName: string;
}

export interface MailTicket {
  name: string;
  url: string;
}

function layout(event: MailEvent, body: string): string {
  return `
    <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">${esc(event.title)}</h1>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">${esc(event.churchName)} · ${esc(formatDateTime(event.startsAt))}${event.location ? ` · ${esc(event.location)}` : ""}</p>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; color: #111827;">
        ${body}
        <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
          Vous recevez cet email parce que vous avez réservé pour cet événement. Ne transférez pas le lien
          « Ma réservation » : il permet de modifier et d'annuler la réservation.
        </p>
      </div>
    </div>`;
}

const button = (url: string, label: string) =>
  `<p style="margin: 20px 0;"><a href="${esc(url)}" style="background: #5E17EB; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: 600;">${esc(label)}</a></p>`;

function ticketsBlock(tickets: MailTicket[]): string {
  if (tickets.length === 0) return "";
  const rows = tickets.map((t) => `<li style="margin: 4px 0;"><a href="${esc(t.url)}" style="color: #5E17EB;">Billet de ${esc(t.name)}</a></li>`).join("");
  return `<p style="margin: 16px 0 4px; font-weight: 600;">Billets</p><ul style="margin: 0; padding-left: 20px;">${rows}</ul>
    <p style="font-size: 13px; color: #374151;">Chaque billet peut être transmis séparément à la personne concernée.</p>`;
}

function instructionsBlock(due: number, i: PaymentInstructions | null): string {
  if (due <= 0 || !i) return "";
  const lines: string[] = [];
  if (i.wero) lines.push(`<li><strong>Wero</strong> : ${esc(i.wero)}</li>`);
  if (i.revolut) lines.push(`<li><strong>Revolut</strong> : <a href="${esc(i.revolut)}">${esc(i.revolut)}</a></li>`);
  if (i.transfer) lines.push(`<li><strong>Virement</strong> : ${esc(i.transfer.iban)} (${esc(i.transfer.holder)})</li>`);
  if (i.cash || i.cheque) lines.push(`<li>${[i.cash ? "Espèces" : "", i.cheque ? "chèque" : ""].filter(Boolean).join(" ou ")} sur place</li>`);
  return `<div style="background: #f5f3ff; padding: 12px 16px; border-radius: 6px; margin: 16px 0;">
      <p style="margin: 0 0 6px;"><strong>Reste à régler : ${esc(formatEuros(due))}</strong></p>
      <p style="margin: 0 0 6px;">Indiquez la référence <strong>${esc(i.reference)}</strong> avec votre paiement.</p>
      <ul style="margin: 0; padding-left: 20px;">${lines.join("")}</ul>
      <p style="margin: 6px 0 0; font-size: 13px;">Une fois payé, cliquez sur « J'ai payé » depuis votre réservation.</p>
    </div>`;
}

export interface BookingMail {
  event: MailEvent;
  contactName: string;
  reference: string;
  manageUrl: string;
  tickets: MailTicket[];
  balances: Balances;
  instructions: PaymentInstructions | null;
}

export function bookingConfirmedEmail(m: BookingMail) {
  return {
    subject: `Réservation ${m.reference} — ${m.event.title}`,
    html: layout(
      m.event,
      `<p>Bonjour ${esc(m.contactName)},</p>
       <p>Votre réservation <strong>${esc(m.reference)}</strong> est enregistrée.</p>
       ${ticketsBlock(m.tickets)}
       ${instructionsBlock(m.balances.due, m.instructions)}
       ${button(m.manageUrl, "Ma réservation")}`
    ),
  };
}

export function bookingUpdatedEmail(m: BookingMail, change: string) {
  return {
    subject: `Réservation ${m.reference} modifiée — ${m.event.title}`,
    html: layout(
      m.event,
      `<p>Bonjour ${esc(m.contactName)},</p>
       <p>${esc(change)}</p>
       ${ticketsBlock(m.tickets)}
       ${instructionsBlock(m.balances.due, m.instructions)}
       ${button(m.manageUrl, "Ma réservation")}`
    ),
  };
}

export function paymentConfirmedEmail(m: BookingMail, amount: number) {
  return {
    subject: `Paiement confirmé — ${m.reference}`,
    html: layout(
      m.event,
      `<p>Bonjour ${esc(m.contactName)},</p>
       <p>Votre paiement de <strong>${esc(formatEuros(amount))}</strong> pour la réservation ${esc(m.reference)} est confirmé.</p>
       ${instructionsBlock(m.balances.due, m.instructions)}
       ${button(m.manageUrl, "Ma réservation")}`
    ),
  };
}

export function paymentRejectedEmail(m: BookingMail, reason: string) {
  return {
    subject: `Paiement non reçu — ${m.reference}`,
    html: layout(
      m.event,
      `<p>Bonjour ${esc(m.contactName)},</p>
       <p>Votre déclaration de paiement pour la réservation ${esc(m.reference)} n'a pas pu être confirmée.</p>
       <p><strong>Motif :</strong> ${esc(reason)}</p>
       ${instructionsBlock(m.balances.due, m.instructions)}
       ${button(m.manageUrl, "Ma réservation")}`
    ),
  };
}

export function reminderEmail(m: BookingMail, deadline: Date) {
  return {
    subject: `Rappel de paiement — ${m.event.title}`,
    html: layout(
      m.event,
      `<p>Bonjour ${esc(m.contactName)},</p>
       <p>Votre réservation ${esc(m.reference)} comporte encore un montant à régler. Les options non réglées
       au <strong>${esc(formatDateTime(deadline))}</strong> seront libérées.</p>
       ${instructionsBlock(m.balances.due, m.instructions)}
       ${button(m.manageUrl, "Ma réservation")}`
    ),
  };
}

export function releasedEmail(m: BookingMail, labels: string[]) {
  return {
    subject: `Options libérées — ${m.reference}`,
    html: layout(
      m.event,
      `<p>Bonjour ${esc(m.contactName)},</p>
       <p>Faute de paiement à la date limite, ces options ont été retirées de votre réservation :</p>
       <ul>${labels.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
       <p>Vos billets restent valables.</p>
       ${button(m.manageUrl, "Ma réservation")}`
    ),
  };
}

export function dayBeforeEmail(m: BookingMail) {
  return {
    subject: `C'est demain — ${m.event.title}`,
    html: layout(
      m.event,
      `<p>Bonjour ${esc(m.contactName)},</p>
       <p>Nous vous attendons demain. Présentez votre billet à l'entrée, sur votre téléphone ou imprimé.</p>
       ${ticketsBlock(m.tickets)}
       ${instructionsBlock(m.balances.due, m.instructions)}
       ${button(m.manageUrl, "Ma réservation")}`
    ),
  };
}

export function cancelledEmail(m: BookingMail, what: string, refundNote: string | null) {
  return {
    subject: `Annulation — ${m.reference}`,
    html: layout(
      m.event,
      `<p>Bonjour ${esc(m.contactName)},</p>
       <p>${esc(what)}</p>
       ${refundNote ? `<p>${esc(refundNote)}</p>` : ""}
       ${ticketsBlock(m.tickets)}
       ${button(m.manageUrl, "Ma réservation")}`
    ),
  };
}

export function recoverEmail(event: MailEvent, links: { reference: string; url: string }[]) {
  return {
    subject: `Vos réservations — ${event.title}`,
    html: layout(
      event,
      `<p>Bonjour,</p>
       <p>Voici le lien vers ${links.length > 1 ? "vos réservations" : "votre réservation"} :</p>
       <ul>${links.map((l) => `<li><a href="${esc(l.url)}" style="color: #5E17EB;">Réservation ${esc(l.reference)}</a></li>`).join("")}</ul>`
    ),
  };
}

export const methodLabel = (m: keyof typeof PAYMENT_METHOD_LABEL) => PAYMENT_METHOD_LABEL[m];

/**
 * Envoie un email au contact : notification (préférence respectée) s'il a un compte, sinon
 * email direct. Les erreurs d'envoi sont journalisées, jamais propagées.
 */
export async function deliverToContact(
  contact: { userId: string | null; email: string },
  mail: { subject: string; html: string },
  notification: { type: string; title: string; message: string; link?: string }
): Promise<void> {
  try {
    if (contact.userId) {
      const { createNotification } = await import("@/lib/notifications");
      await createNotification(
        { userId: contact.userId, domain: "ticketing", link: "/billetterie/mes-reservations", ...notification },
        { email: mail }
      );
      return;
    }
    if (!contact.email) return;
    await sendEmail({ to: contact.email, subject: mail.subject, html: mail.html });
  } catch (error) {
    const { logger } = await import("@/lib/logger");
    logger.error(`Billetterie : email non envoyé (${notification.type}) — ${error instanceof Error ? error.message : "erreur"}`);
  }
}
