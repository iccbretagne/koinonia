import nodemailer from "nodemailer";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
  // ignoreTLS : désactive STARTTLS même si le serveur l'annonce (relay local port 25)
  ignoreTLS: process.env.SMTP_IGNORE_TLS === "true",
  tls: {
    // Mettre à "false" si le serveur SMTP utilise un certificat auto-signé
    rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  const from = process.env.SMTP_FROM || "Koinonia <noreply@koinonia.local>";

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });
}

export interface PlanningChange {
  memberName: string;
  departmentName: string;
  eventTitle: string;
  eventDate: string;
  changeType: "added" | "removed" | "updated";
  newStatus?: string | null;
  modifiedBy: string;
}

export function buildPlanningDigestEmail(params: {
  churchName: string;
  changes: PlanningChange[];
  since: Date;
}) {
  const sinceStr = params.since.toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const changeTypeLabel = (type: PlanningChange["changeType"]) => {
    if (type === "added") return "Ajouté au planning";
    if (type === "removed") return "Retiré du planning";
    return "Statut modifié";
  };

  const statusLabel = (status?: string | null) => {
    if (!status) return "";
    const labels: Record<string, string> = {
      EN_SERVICE: "En service",
      EN_SERVICE_DEBRIEF: "En service (débrief)",
      INDISPONIBLE: "Indisponible",
      REMPLACANT: "Remplaçant",
    };
    return labels[status] ?? status;
  };

  const rows = params.changes
    .map(
      (c) => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px 12px;">${escapeHtml(c.eventTitle)}<br><span style="color:#6b7280;font-size:12px;">${new Date(c.eventDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span></td>
        <td style="padding: 8px 12px;">${escapeHtml(c.departmentName)}</td>
        <td style="padding: 8px 12px;">${escapeHtml(c.memberName)}</td>
        <td style="padding: 8px 12px;">${changeTypeLabel(c.changeType)}${c.newStatus ? `<br><span style="color:#5E17EB;font-size:12px;">${statusLabel(c.newStatus)}</span>` : ""}</td>
        <td style="padding: 8px 12px; color:#6b7280; font-size:12px;">${escapeHtml(c.modifiedBy)}</td>
      </tr>`
    )
    .join("");

  return {
    subject: `[${escapeHtml(params.churchName)}] Digest planning — ${params.changes.length} modification${params.changes.length > 1 ? "s" : ""}`,
    html: `
      <div style="font-family: Montserrat, sans-serif; max-width: 700px; margin: 0 auto;">
        <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Koinonia — Digest planning</h1>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">${escapeHtml(params.churchName)}</p>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="color: #6b7280; font-size: 13px; margin-top: 0;">Modifications depuis le ${sinceStr}</p>
          <table style="width:100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f9fafb; text-align: left;">
                <th style="padding: 8px 12px; font-weight: 600;">Événement</th>
                <th style="padding: 8px 12px; font-weight: 600;">Département</th>
                <th style="padding: 8px 12px; font-weight: 600;">Membre</th>
                <th style="padding: 8px 12px; font-weight: 600;">Changement</th>
                <th style="padding: 8px 12px; font-weight: 600;">Modifié par</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `,
  };
}

export function buildAppointmentConfirmationEmail(params: {
  firstName: string;
  lastName: string;
  subject: string;
  churchName: string;
}) {
  const name = escapeHtml(`${params.firstName} ${params.lastName}`);
  const subject = escapeHtml(params.subject);
  const church = escapeHtml(params.churchName);
  return {
    subject: `Votre demande de RDV pastoral a bien été reçue — ${church}`,
    html: `
      <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Koinonia</h1>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">${church}</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Bonjour <strong>${name}</strong>,</p>
          <p>Votre demande de rendez-vous pastoral concernant <strong>« ${subject} »</strong> a bien été reçue.</p>
          <p>Un membre de l'équipe pastorale prendra contact avec vous prochainement pour convenir d'un créneau.</p>
          <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
            Vous recevez cet email car vous avez soumis une demande de RDV sur le formulaire de ${church}.
          </p>
        </div>
      </div>
    `,
  };
}

export function buildAppointmentRejectedEmail(params: {
  firstName: string;
  lastName: string;
  subject: string;
  churchName: string;
  rejectReason?: string | null;
}) {
  const name = escapeHtml(`${params.firstName} ${params.lastName}`);
  const subject = escapeHtml(params.subject);
  const church = escapeHtml(params.churchName);
  const reason = params.rejectReason ? `<p>Motif : <em>${escapeHtml(params.rejectReason)}</em></p>` : "";
  return {
    subject: `Votre demande de RDV pastoral n'a pas pu être traitée — ${church}`,
    html: `
      <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Koinonia</h1>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">${church}</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Bonjour <strong>${name}</strong>,</p>
          <p>Votre demande de rendez-vous pastoral concernant <strong>« ${subject} »</strong> n'a malheureusement pas pu être retenue.</p>
          ${reason}
          <p>N'hésitez pas à soumettre une nouvelle demande si votre besoin persiste.</p>
          <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
            Vous recevez cet email car vous avez soumis une demande de RDV sur le formulaire de ${church}.
          </p>
        </div>
      </div>
    `,
  };
}

export function buildAppointmentScheduledEmail(params: {
  firstName: string;
  lastName: string;
  subject: string;
  churchName: string;
  startsAt: Date;
  location?: string | null;
}) {
  const name = escapeHtml(`${params.firstName} ${params.lastName}`);
  const subject = escapeHtml(params.subject);
  const church = escapeHtml(params.churchName);
  const dateStr = params.startsAt.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const timeStr = params.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const location = params.location ? `<p>Lieu : <strong>${escapeHtml(params.location)}</strong></p>` : "";
  return {
    subject: `Votre rendez-vous pastoral est confirmé — ${church}`,
    html: `
      <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Koinonia</h1>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">${church}</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Bonjour <strong>${name}</strong>,</p>
          <p>Votre rendez-vous pastoral concernant <strong>« ${subject} »</strong> a été planifié.</p>
          <p>Date : <strong>${dateStr} à ${timeStr}</strong></p>
          ${location}
          <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
            Vous recevez cet email car vous avez soumis une demande de RDV sur le formulaire de ${church}.
          </p>
        </div>
      </div>
    `,
  };
}

export function buildAccountingNewRequestEmail(params: {
  requestLabel: string;
  requestAmount: string;
  requestType: string;
  departmentName: string;
  submitterName: string;
  description?: string | null;
  churchName: string;
  requestUrl: string;
}) {
  const label      = escapeHtml(params.requestLabel);
  const amount     = escapeHtml(params.requestAmount);
  const type       = params.requestType === "EXPENSE_REPORT" ? "Note de frais" : "Avance de budget";
  const dept       = escapeHtml(params.departmentName);
  const submitter  = escapeHtml(params.submitterName);
  const church     = escapeHtml(params.churchName);
  const desc       = params.description ? `<p style="color:#374151;font-size:14px;margin-top:12px;"><strong>Description :</strong> ${escapeHtml(params.description)}</p>` : "";

  return {
    subject: `[Compta] Nouvelle demande — ${label} (${amount}) — ${church}`,
    html: `
      <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Koinonia — Nouvelle demande financière</h1>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">${church}</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
            <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Type</td><td style="padding:6px 0;font-weight:600;">${type}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Intitulé</td><td style="padding:6px 0;font-weight:600;">${label}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Montant</td><td style="padding:6px 0;font-weight:600;color:#5E17EB;">${amount}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Département</td><td style="padding:6px 0;">${dept}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Demandeur</td><td style="padding:6px 0;">${submitter}</td></tr>
          </table>
          ${desc}
          <p style="margin-top:20px;">
            <a href="${params.requestUrl}" style="display:inline-block;background:#5E17EB;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;">
              Traiter la demande →
            </a>
          </p>
          <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
            Vous recevez cet email car vous êtes l'adresse comptabilité de ${church}.
          </p>
        </div>
      </div>
    `,
  };
}

export function buildAccountingStatusEmail(params: {
  userName: string;
  requestLabel: string;
  requestAmount: string;
  status: "PROCESSING" | "APPROVED" | "REJECTED" | "CANCELLED";
  priority?: string | null;
  priorityNote?: string | null;
  rejectionReason?: string | null;
  churchName: string;
  requestUrl: string;
}) {
  const name = escapeHtml(params.userName);
  const label = escapeHtml(params.requestLabel);
  const amount = escapeHtml(params.requestAmount);
  const church = escapeHtml(params.churchName);
  const url = params.requestUrl;

  const subjects: Record<string, string> = {
    PROCESSING: `Votre demande est prise en charge — ${church}`,
    APPROVED:   `Votre demande a été validée ✓ — ${church}`,
    REJECTED:   `Votre demande n'a pas pu être retenue — ${church}`,
    CANCELLED:  `Votre demande a été annulée — ${church}`,
  };

  const intros: Record<string, string> = {
    PROCESSING: params.priority === "URGENT"
      ? `Votre demande <strong>« ${label} »</strong> (${amount}) est en cours de traitement en priorité urgente${params.priorityNote ? ` : <em>${escapeHtml(params.priorityNote)}</em>` : ""}.`
      : `Votre demande <strong>« ${label} »</strong> (${amount}) est en cours de traitement. Elle sera traitée dans les meilleurs délais.`,
    APPROVED:   `Votre demande <strong>« ${label} »</strong> (${amount}) a été validée. Consultez le plan de paiement pour connaître les dates de remise.`,
    REJECTED:   `Votre demande <strong>« ${label} »</strong> (${amount}) n'a malheureusement pas pu être retenue.${params.rejectionReason ? `<br><br>Motif : <em>${escapeHtml(params.rejectionReason)}</em>` : ""}`,
    CANCELLED:  `Votre demande <strong>« ${label} »</strong> (${amount}) a été annulée.`,
  };

  return {
    subject: subjects[params.status],
    html: `
      <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Koinonia — Comptabilité</h1>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">${church}</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Bonjour <strong>${name}</strong>,</p>
          <p>${intros[params.status]}</p>
          <p>
            <a href="${url}" style="display:inline-block;background:#5E17EB;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;">
              Voir ma demande →
            </a>
          </p>
          <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
            Vous recevez cet email car vous avez soumis une demande financière sur Koinonia.
          </p>
        </div>
      </div>
    `,
  };
}

export function buildAccountingPaymentEmail(params: {
  userName: string;
  requestLabel: string;
  trancheNumber: number;
  releasedAmount: string;
  plannedAmount: string;
  isPartial: boolean;
  residualAmount?: string;
  churchName: string;
  requestUrl: string;
}) {
  const name = escapeHtml(params.userName);
  const label = escapeHtml(params.requestLabel);
  const church = escapeHtml(params.churchName);

  const body = params.isPartial
    ? `Un versement partiel de <strong>${escapeHtml(params.releasedAmount)}</strong> sur <strong>${escapeHtml(params.plannedAmount)}</strong> a été confirmé pour la tranche ${params.trancheNumber} de votre demande <strong>« ${label} »</strong>.${params.residualAmount ? ` Le solde restant de <strong>${escapeHtml(params.residualAmount)}</strong> a été reporté en nouvelle tranche.` : ""}`
    : `La tranche ${params.trancheNumber} de votre demande <strong>« ${label} »</strong> a été remise : <strong>${escapeHtml(params.releasedAmount)}</strong>.`;

  return {
    subject: `Fonds remis${params.isPartial ? " (partiel)" : ""} — ${label} — ${church}`,
    html: `
      <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Koinonia — Comptabilité</h1>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">${church}</p>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Bonjour <strong>${name}</strong>,</p>
          <p>${body}</p>
          <p>
            <a href="${params.requestUrl}" style="display:inline-block;background:#5E17EB;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;">
              Voir ma demande →
            </a>
          </p>
          <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
            Vous recevez cet email car vous avez soumis une demande financière sur Koinonia.
          </p>
        </div>
      </div>
    `,
  };
}

export function buildJobOfferEmail(params: {
  subscriberName: string | null;
  jobTitle: string;
  company: string;
  type: string;
  location: string | null;
  duration: string | null;
  deadline: Date | null;
  description: string;
  contactEmail: string | null;
  contactUrl: string | null;
  jobUrl: string;
}) {
  const typeLabel = params.type === "EMPLOI" ? "Emploi" : params.type === "STAGE" ? "Stage" : "Alternance";
  const title = escapeHtml(params.jobTitle);
  const company = escapeHtml(params.company);
  const location = params.location ? `<tr><td style="padding:6px 0;color:#6b7280;width:130px;">Lieu</td><td style="padding:6px 0;">${escapeHtml(params.location)}</td></tr>` : "";
  const duration = params.duration ? `<tr><td style="padding:6px 0;color:#6b7280;">Durée</td><td style="padding:6px 0;">${escapeHtml(params.duration)}</td></tr>` : "";
  const deadlineStr = params.deadline ? new Date(params.deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
  const deadline = deadlineStr ? `<tr><td style="padding:6px 0;color:#6b7280;">Date limite</td><td style="padding:6px 0;">${deadlineStr}</td></tr>` : "";
  const contact = params.contactEmail
    ? `<p style="margin-top:16px;font-size:14px;">Candidature : <a href="mailto:${escapeHtml(params.contactEmail)}" style="color:#5E17EB;">${escapeHtml(params.contactEmail)}</a></p>`
    : params.contactUrl
      ? `<p style="margin-top:16px;font-size:14px;"><a href="${escapeHtml(params.contactUrl)}" style="color:#5E17EB;">Postuler en ligne →</a></p>`
      : "";
  const greeting = params.subscriberName ? `<p>Bonjour <strong>${escapeHtml(params.subscriberName)}</strong>,</p>` : "<p>Bonjour,</p>";

  return {
    subject: `[Emploi] ${typeLabel} — ${params.jobTitle} chez ${params.company}`,
    html: `
      <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Koinonia — Nouvelle offre ${typeLabel}</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          ${greeting}
          <p>Une nouvelle offre a été publiée sur Koinonia :</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
            <tr><td style="padding:6px 0;color:#6b7280;width:130px;">Poste</td><td style="padding:6px 0;font-weight:600;">${title}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Entreprise</td><td style="padding:6px 0;">${company}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Type</td><td style="padding:6px 0;">${typeLabel}</td></tr>
            ${location}${duration}${deadline}
          </table>
          ${contact}
          <p style="margin-top:20px;">
            <a href="${params.jobUrl}" style="display:inline-block;background:#5E17EB;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;">
              Voir l&apos;offre complète →
            </a>
          </p>
          <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
            Vous recevez cet email car vous êtes abonné aux notifications d&apos;offres d&apos;emploi sur Koinonia.
            Gérez vos préférences depuis votre profil.
          </p>
        </div>
      </div>
    `,
  };
}

export function buildReminderEmail(params: {
  memberName: string;
  eventTitle: string;
  eventDate: string;
  departmentName: string;
  daysUntil: number;
}) {
  const dateStr = new Date(params.eventDate).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const memberName = escapeHtml(params.memberName);
  const eventTitle = escapeHtml(params.eventTitle);
  const departmentName = escapeHtml(params.departmentName);

  return {
    subject: `Rappel : ${params.eventTitle} — ${params.daysUntil === 1 ? "demain" : `dans ${params.daysUntil} jours`}`,
    html: `
      <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Koinonia</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Bonjour <strong>${memberName}</strong>,</p>
          <p>
            Vous êtes en service pour l'événement
            <strong>${eventTitle}</strong> le <strong>${dateStr}</strong>
            au département <strong>${departmentName}</strong>.
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            ${params.daysUntil === 1 ? "C'est demain !" : `C'est dans ${params.daysUntil} jours.`}
          </p>
        </div>
      </div>
    `,
  };
}
