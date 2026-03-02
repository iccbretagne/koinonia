import nodemailer from "nodemailer";

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
  const from = process.env.SMTP_FROM || "PlanningCenter <noreply@planningcenter.local>";

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });
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

  return {
    subject: `Rappel : ${params.eventTitle} — ${params.daysUntil === 1 ? "demain" : `dans ${params.daysUntil} jours`}`,
    html: `
      <div style="font-family: Montserrat, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5E17EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">PlanningCenter</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Bonjour <strong>${params.memberName}</strong>,</p>
          <p>
            Vous êtes en service pour l'événement
            <strong>${params.eventTitle}</strong> le <strong>${dateStr}</strong>
            au département <strong>${params.departmentName}</strong>.
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            ${params.daysUntil === 1 ? "C'est demain !" : `C'est dans ${params.daysUntil} jours.`}
          </p>
        </div>
      </div>
    `,
  };
}
