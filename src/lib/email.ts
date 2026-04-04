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
