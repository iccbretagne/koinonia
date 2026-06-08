import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

// ─── Emails ──────────────────────────────────────────────────────────────────

export function buildConfirmationEmail(params: {
  firstName: string;
  churchName: string;
  suggestedFamilyName: string | null;
  pastoralCare: boolean;
}): string {
  const { firstName, churchName, suggestedFamilyName, pastoralCare } = params;
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#5E17EB;padding:32px 32px 24px">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700">${churchName}</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:14px">Demande d'intégration reçue</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;color:#111827;font-size:15px">Bonjour ${firstName},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6">
        Nous avons bien reçu ta demande pour rejoindre une famille. Notre équipe va prendre en charge ton dossier et te contacter très prochainement.
      </p>
      ${suggestedFamilyName ? `
      <div style="background:#f5f3ff;border-left:4px solid #5E17EB;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px">
        <p style="margin:0;color:#5E17EB;font-size:13px;font-weight:600">Famille suggérée</p>
        <p style="margin:4px 0 0;color:#374151;font-size:14px">${suggestedFamilyName}</p>
      </div>` : ""}
      ${pastoralCare ? `
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px">
        <p style="margin:0;color:#92400e;font-size:13px">Ta demande de rendez-vous pastoral a également été enregistrée. Un pasteur te contactera séparément.</p>
      </div>` : ""}
      <p style="margin:24px 0 0;color:#6b7280;font-size:13px">
        À bientôt,<br>
        <strong style="color:#111827">L'équipe d'intégration — ${churchName}</strong>
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;color:#9ca3af;font-size:11px">Ce message est automatique. Merci de ne pas y répondre directement.</p>
    </div>
  </div>
</body>
</html>`;
}

export function buildBergerNotifEmail(params: {
  bergerName: string;
  firstName: string;
  lastName: string;
  familyName: string | null;
  requestId: string;
  appUrl: string;
}): string {
  const { bergerName, firstName, lastName, familyName, requestId, appUrl } = params;
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#5E17EB;padding:28px 32px 20px">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">Nouvelle demande d'intégration</h1>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 14px;color:#111827;font-size:15px">Bonjour ${bergerName},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6">
        Une demande d'intégration vient de vous être affectée :
      </p>
      <div style="background:#f5f3ff;border-left:4px solid #5E17EB;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px">
        <p style="margin:0;color:#111827;font-size:15px;font-weight:600">${firstName} ${lastName}</p>
        ${familyName ? `<p style="margin:4px 0 0;color:#6b7280;font-size:13px">Famille : ${familyName}</p>` : ""}
      </div>
      <a href="${appUrl}/admin/integration/requests/${requestId}"
         style="display:inline-block;background:#5E17EB;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">
        Voir la demande →
      </a>
    </div>
    <div style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;color:#9ca3af;font-size:11px">Notification automatique Koinonia.</p>
    </div>
  </div>
</body>
</html>`;
}

export function buildInactivityEmail(params: {
  churchName: string;
  personName: string;
  status: string;
  daysSince: number;
  link: string;
  appUrl: string;
}): string {
  const { churchName, personName, status, daysSince, link, appUrl } = params;
  const contextMap: Record<string, string> = {
    SUBMITTED: "La demande n'a pas encore été affectée à une famille.",
    ASSIGNED: "La demande a été affectée mais le contact n'a pas encore été établi.",
    CONTACTED: "Le contact a été établi mais aucune progression n'a été enregistrée.",
  };
  const context = contextMap[status] ?? "Aucune mise à jour récente.";
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#5E17EB;padding:28px 32px">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${churchName}</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px">Rappel — Intégration familles</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 12px;color:#111827;font-size:15px">Bonjour,</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6">
        La demande de <strong>${personName}</strong> est inactive depuis <strong>${daysSince} jours</strong>.
      </p>
      <div style="background:#fff7ed;border-left:4px solid #f97316;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px">
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5">${context}</p>
      </div>
      <a href="${appUrl}${link}" style="display:inline-block;background:#5E17EB;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">
        Voir la demande →
      </a>
      <p style="margin:24px 0 0;color:#6b7280;font-size:13px">
        À bientôt,<br>
        <strong style="color:#111827">L'équipe Koinonia — ${churchName}</strong>
      </p>
    </div>
    <div style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;color:#9ca3af;font-size:11px">Message automatique. Ne pas répondre directement.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Notifications berger ─────────────────────────────────────────────────────

export async function notifyBergerAssigned(params: {
  bergerId: string;
  firstName: string;
  lastName: string;
  requestId: string;
  familyName: string | null;
  appUrl: string;
}): Promise<void> {
  const { bergerId, firstName, lastName, requestId, familyName, appUrl } = params;
  const berger = await prisma.user.findUnique({
    where: { id: bergerId },
    select: { id: true, name: true, email: true },
  });
  if (!berger) return;

  await prisma.notification.create({
    data: {
      userId: berger.id,
      type: "INTEGRATION_ASSIGNED",
      title: "Nouvelle demande d'intégration",
      message: `${firstName} ${lastName} vous a été affecté${familyName ? ` (${familyName})` : ""}.`,
      link: `/admin/integration/requests/${requestId}`,
    },
  }).catch(() => {});

  if (berger.email) {
    await sendEmail({
      to: berger.email,
      subject: "Nouvelle demande d'intégration vous a été affectée",
      html: buildBergerNotifEmail({
        bergerName: berger.name ?? berger.email,
        firstName,
        lastName,
        familyName,
        requestId,
        appUrl,
      }),
    }).catch(() => {});
  }
}

// ─── Inactivité ───────────────────────────────────────────────────────────────

const INACTIVITY_DAYS = 7;
const INACTIVITY_NOTIF_TYPE = "INTEGRATION_INACTIVITY";

export async function runInactivityNotifications(appUrl: string): Promise<{ notified: number; skipped: number; total: number }> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - INACTIVITY_DAYS);

  const dedupeThreshold = new Date();
  dedupeThreshold.setDate(dedupeThreshold.getDate() - INACTIVITY_DAYS);

  const staleRequests = await prisma.familyIntegrationRequest.findMany({
    where: {
      archivedAt: null,
      status: { in: ["SUBMITTED", "ASSIGNED", "CONTACTED"] },
      updatedAt: { lt: threshold },
    },
    include: {
      assignedBerger: { select: { id: true, name: true, email: true } },
      church: { select: { id: true, name: true } },
    },
  });

  if (staleRequests.length === 0) return { notified: 0, skipped: 0, total: 0 };

  const requestIds = staleRequests.map((r) => r.id);
  const recentNotifs = await prisma.notification.findMany({
    where: {
      type: INACTIVITY_NOTIF_TYPE,
      link: { in: requestIds.map((id) => `/integration/requests/${id}`) },
      createdAt: { gte: dedupeThreshold },
    },
    select: { link: true },
  });
  const alreadyNotifiedLinks = new Set(recentNotifs.map((n) => n.link));

  const managersByChurch: Record<string, { id: string; email: string | null }[]> = {};

  async function getManagers(churchId: string) {
    if (managersByChurch[churchId]) return managersByChurch[churchId];
    const integrationDept = await prisma.department.findFirst({
      where: { function: "INTEGRATION", ministry: { churchId } },
      select: { id: true },
    });
    if (!integrationDept) { managersByChurch[churchId] = []; return []; }
    const memberships = await prisma.userDepartment.findMany({
      where: { departmentId: integrationDept.id },
      include: { userChurchRole: { select: { userId: true, user: { select: { id: true, email: true } } } } },
    });
    const managers = memberships.map((m) => ({ id: m.userChurchRole.userId, email: m.userChurchRole.user.email }));
    managersByChurch[churchId] = managers;
    return managers;
  }

  const titleMap: Record<string, string> = {
    SUBMITTED: "Demande sans suite depuis 7 jours",
    ASSIGNED: "Contact non établi depuis 7 jours",
    CONTACTED: "Suivi en attente depuis 7 jours",
  };

  let notified = 0;
  let skipped = 0;

  for (const req of staleRequests) {
    const link = `/integration/requests/${req.id}`;
    if (alreadyNotifiedLinks.has(link)) { skipped++; continue; }

    const personName = `${req.firstName} ${req.lastName}`;
    const daysSince = Math.floor((Date.now() - req.updatedAt.getTime()) / 86_400_000);
    const title = titleMap[req.status] ?? "Demande inactive";
    const message = `${personName} — aucune mise à jour depuis ${daysSince} jours.`;

    if (req.status === "SUBMITTED") {
      const managers = await getManagers(req.churchId);
      for (const manager of managers) {
        await prisma.notification.create({
          data: { userId: manager.id, type: INACTIVITY_NOTIF_TYPE, title, message, link },
        });
        notified++;
        if (process.env.SMTP_HOST && manager.email) {
          await sendEmail({
            to: manager.email,
            subject: `${req.church.name} — ${title}`,
            html: buildInactivityEmail({ churchName: req.church.name, personName, status: req.status, daysSince, link, appUrl }),
          }).catch(() => {});
        }
      }
    } else if (req.assignedBerger) {
      await prisma.notification.create({
        data: { userId: req.assignedBerger.id, type: INACTIVITY_NOTIF_TYPE, title, message, link },
      });
      notified++;
      if (process.env.SMTP_HOST && req.assignedBerger.email) {
        await sendEmail({
          to: req.assignedBerger.email,
          subject: `${req.church.name} — ${title}`,
          html: buildInactivityEmail({ churchName: req.church.name, personName, status: req.status, daysSince, link, appUrl }),
        }).catch(() => {});
      }
    }
  }

  return { notified, skipped, total: staleRequests.length };
}
