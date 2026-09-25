import { prisma } from "@/lib/prisma";
import { DEPT_FN } from "@/lib/department-functions";
import { getFunctionDepartmentIds } from "@/lib/function-departments";
import { createNotification, notifyUsers, dispatchUserEmails } from "@/lib/notifications";

// ─── Emails ──────────────────────────────────────────────────────────────────

export function buildConfirmationEmail(params: {
  firstName: string;
  churchName: string;
  suggestedFamilyName: string | null;
  pastoralCare: boolean;
  /** La personne a demandé à être recontactée plus tard (spec 051). */
  contactLater?: boolean;
}): string {
  const { firstName, churchName, suggestedFamilyName, pastoralCare, contactLater = false } = params;
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
        ${contactLater
          ? "Nous avons bien reçu ta demande pour rejoindre une famille. Comme tu l'as souhaité, notre équipe conserve tes coordonnées et te recontactera plus tard."
          : "Nous avons bien reçu ta demande pour rejoindre une famille. Notre équipe va prendre en charge ton dossier et te contacter très prochainement."}
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

  await createNotification(
    {
      userId: berger.id,
      domain: "integration",
      type: "INTEGRATION_ASSIGNED",
      title: "Nouvelle demande d'intégration",
      message: `${firstName} ${lastName} vous a été affecté${familyName ? ` (${familyName})` : ""}.`,
      link: `/admin/integration/requests/${requestId}`,
    },
    berger.email
      ? {
          email: {
            subject: "Nouvelle demande d'intégration vous a été affectée",
            html: buildBergerNotifEmail({
              bergerName: berger.name ?? berger.email,
              firstName,
              lastName,
              familyName,
              requestId,
              appUrl,
            }),
          },
        }
      : undefined
  ).catch(() => {});
}

// ─── Équipe intégration ───────────────────────────────────────────────────────

/**
 * Résolveur (mis en cache par église) des membres de l'équipe intégration à notifier.
 * Une fonction peut être portée par plusieurs départements (spec 046) — dédoublonnage par
 * userId pour qu'une personne membre de plusieurs d'entre eux ne soit notifiée qu'une fois.
 */
function createIntegrationManagersResolver() {
  const managersByChurch: Record<string, { id: string; email: string | null }[]> = {};
  return async function getManagers(churchId: string) {
    if (managersByChurch[churchId]) return managersByChurch[churchId];
    const integrationDeptIds = await getFunctionDepartmentIds(churchId, DEPT_FN.INTEGRATION);
    if (integrationDeptIds.length === 0) { managersByChurch[churchId] = []; return []; }
    const memberships = await prisma.userDepartment.findMany({
      where: { departmentId: { in: integrationDeptIds } },
      include: { userChurchRole: { select: { userId: true, user: { select: { id: true, email: true } } } } },
    });
    const managersById = new Map(
      memberships.map((m) => [m.userChurchRole.userId, { id: m.userChurchRole.userId, email: m.userChurchRole.user.email }])
    );
    const managers = Array.from(managersById.values());
    managersByChurch[churchId] = managers;
    return managers;
  };
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

  const getManagers = createIntegrationManagersResolver();

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
      if (managers.length > 0) {
        const managerIds = managers.map((m) => m.id);
        await notifyUsers(managerIds, { domain: "integration", type: INACTIVITY_NOTIF_TYPE, title, message, link });
        notified += managers.length;
        const html = buildInactivityEmail({ churchName: req.church.name, personName, status: req.status, daysSince, link, appUrl });
        await dispatchUserEmails(managerIds, "integration", { subject: `${req.church.name} — ${title}`, html }).catch(() => {});
      }
    } else if (req.assignedBerger) {
      const html = buildInactivityEmail({ churchName: req.church.name, personName, status: req.status, daysSince, link, appUrl });
      await createNotification(
        { userId: req.assignedBerger.id, domain: "integration", type: INACTIVITY_NOTIF_TYPE, title, message, link },
        req.assignedBerger.email ? { email: { subject: `${req.church.name} — ${title}`, html } } : undefined
      ).catch(() => {});
      notified++;
    }
  }

  return { notified, skipped, total: staleRequests.length };
}

// ─── Dessaisissement berger (spec 051) ────────────────────────────────────────

/** Informe un berger qu'une demande ne lui est plus confiée (réaffectation, reprise de zéro). */
export async function notifyBergerUnassigned(params: {
  bergerId: string;
  firstName: string;
  lastName: string;
}): Promise<void> {
  const { bergerId, firstName, lastName } = params;
  await createNotification({
    userId: bergerId,
    domain: "integration",
    type: "INTEGRATION_UNASSIGNED",
    title: "Demande d'intégration retirée",
    message: `La demande de ${firstName} ${lastName} ne vous est plus confiée.`,
    // Pas de lien vers la fiche : le berger n'y a plus accès.
  }).catch(() => {});
}

// ─── Réglages (spec 051) ──────────────────────────────────────────────────────

export const DEFAULT_INTEGRATION_SETTINGS = { recontactDelayDays: 60, missionDelayDays: 30 };

export interface IntegrationDelays {
  recontactDelayDays: number;
  missionDelayDays: number;
}

/** Réglages de l'église, avec valeurs par défaut tant qu'aucune ligne n'a été enregistrée. */
export async function getIntegrationSettings(churchId: string): Promise<IntegrationDelays> {
  const settings = await prisma.integrationSettings.findUnique({
    where: { churchId },
    select: { recontactDelayDays: true, missionDelayDays: true },
  });
  return settings ?? { ...DEFAULT_INTEGRATION_SETTINGS };
}

export async function updateIntegrationSettings(
  churchId: string,
  data: IntegrationDelays
): Promise<IntegrationDelays> {
  return prisma.integrationSettings.upsert({
    where: { churchId },
    create: { churchId, ...data },
    update: data,
    select: { recontactDelayDays: true, missionDelayDays: true },
  });
}

// ─── Relances des demandes en attente (spec 051) ──────────────────────────────

/**
 * Échéance de relance d'une demande en attente : délai propre à l'état, compté depuis la
 * dernière relance consignée ou, à défaut, depuis la mise en attente. `null` hors attente.
 */
export function relanceDueAt(
  request: { status: string; waitingSince: Date | null; lastRelanceAt: Date | null },
  delays: IntegrationDelays
): Date | null {
  const base = request.lastRelanceAt ?? request.waitingSince;
  if (!base) return null;
  let days: number;
  if (request.status === "WAITING_RECONTACT") days = delays.recontactDelayDays;
  else if (request.status === "WAITING_MISSION") days = delays.missionDelayDays;
  else return null;
  return new Date(base.getTime() + days * 86_400_000);
}

export function isRelanceDue(
  request: { status: string; waitingSince: Date | null; lastRelanceAt: Date | null },
  delays: IntegrationDelays,
  now: Date
): boolean {
  const due = relanceDueAt(request, delays);
  return due !== null && due.getTime() <= now.getTime();
}

/** Cible de la relance, telle qu'annoncée à l'équipe. */
export function relanceTargetLabel(status: string): string {
  return status === "WAITING_MISSION" ? "le département mission" : "la personne";
}

export function buildRelanceEmail(params: {
  churchName: string;
  personName: string;
  status: string;
  link: string;
  appUrl: string;
}): string {
  const { churchName, personName, status, link, appUrl } = params;
  const context =
    status === "WAITING_MISSION"
      ? `La demande de <strong>${personName}</strong> attend la décision du département mission (adresse hors zone). Relancez le département mission, puis consignez la relance sur la demande.`
      : `<strong>${personName}</strong> a souhaité être recontacté(e) plus tard. Recontactez cette personne, puis consignez la relance sur la demande.`;
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#5E17EB;padding:28px 32px">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${churchName}</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px">Relance — Intégration familles</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 12px;color:#111827;font-size:15px">Bonjour,</p>
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

const RELANCE_NOTIF_TYPE = "INTEGRATION_RELANCE";

/**
 * Alerte toute l'équipe intégration pour chaque demande en attente dont l'échéance est
 * dépassée. Une seule notification par échéance : une fois l'alerte émise, elle ne se répète
 * qu'après qu'une relance a été consignée et qu'un nouveau délai complet s'est écoulé. La
 * liste « à relancer » du tableau de bord reste, elle, toujours à jour. Aucune demande n'est
 * jamais abandonnée automatiquement.
 */
export async function runWaitingRelanceNotifications(
  appUrl: string
): Promise<{ notified: number; skipped: number; total: number }> {
  const now = new Date();
  const waiting = await prisma.familyIntegrationRequest.findMany({
    where: {
      archivedAt: null,
      status: { in: ["WAITING_RECONTACT", "WAITING_MISSION"] },
      waitingSince: { not: null },
    },
    select: {
      id: true,
      churchId: true,
      status: true,
      firstName: true,
      lastName: true,
      waitingSince: true,
      lastRelanceAt: true,
      church: { select: { name: true } },
    },
  });

  const settingsByChurch = new Map<string, IntegrationDelays>();
  const due: { req: (typeof waiting)[number]; dueAt: Date }[] = [];
  for (const req of waiting) {
    let delays = settingsByChurch.get(req.churchId);
    if (!delays) {
      delays = await getIntegrationSettings(req.churchId);
      settingsByChurch.set(req.churchId, delays);
    }
    const dueAt = relanceDueAt(req, delays);
    if (dueAt && dueAt.getTime() <= now.getTime()) due.push({ req, dueAt });
  }

  if (due.length === 0) return { notified: 0, skipped: 0, total: 0 };

  const getManagers = createIntegrationManagersResolver();
  let notified = 0;
  let skipped = 0;

  for (const { req, dueAt } of due) {
    const link = `/integration/requests/${req.id}`;
    const alreadyNotified = await prisma.notification.count({
      where: { type: RELANCE_NOTIF_TYPE, link, createdAt: { gte: dueAt } },
    });
    if (alreadyNotified > 0) { skipped++; continue; }

    const personName = `${req.firstName} ${req.lastName}`;
    const title = `Relance due : ${personName}`;
    const message = `Relancer ${relanceTargetLabel(req.status)} au sujet de la demande de ${personName}.`;
    const managers = await getManagers(req.churchId);
    if (managers.length > 0) {
      const managerIds = managers.map((m) => m.id);
      await notifyUsers(managerIds, { domain: "integration", type: RELANCE_NOTIF_TYPE, title, message, link });
      notified += managers.length;
      const html = buildRelanceEmail({ churchName: req.church.name, personName, status: req.status, link, appUrl });
      await dispatchUserEmails(managerIds, "integration", { subject: `${req.church.name} — ${title}`, html }).catch(() => {});
    }
  }

  return { notified, skipped, total: due.length };
}

// ─── Renvoi à l'équipe intégration (spec 051, amendement de recette) ──────────

/** Prévient toute l'équipe intégration qu'un berger lui renvoie une demande, raison comprise. */
export async function notifyIntegrationTeamHandback(params: {
  churchId: string;
  requestId: string;
  firstName: string;
  lastName: string;
  bergerName: string | null;
  reason: string;
}): Promise<void> {
  const { churchId, requestId, firstName, lastName, bergerName, reason } = params;
  const managers = await createIntegrationManagersResolver()(churchId);
  const message = `${bergerName ?? "Le berger"} renvoie la demande de ${firstName} ${lastName} à l'équipe intégration : ${reason}`;
  if (managers.length === 0) return;
  await notifyUsers(
    managers.map((m) => m.id),
    {
      domain: "integration",
      type: "INTEGRATION_HANDBACK",
      title: "Demande renvoyée à l'intégration",
      message,
      link: `/integration/requests/${requestId}`,
    }
  ).catch(() => {});
}
