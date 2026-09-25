import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { createNotification, notifyUsers } from "@/lib/notifications";
import { DEPT_FN } from "@/lib/department-functions";
import { getFunctionDepartmentIds } from "@/lib/function-departments";
import { getCareAccess } from "../auth";
import { resolveAssignee, type ResolvedAssignee } from "./assignee";
import { computeFollowupTransitionData, type FollowupActor, type FollowupPatchBody } from "./followup-state";
import { recordCareHistory } from "./history";
import { notifyAssigneeAssigned, notifyAssigneeUnassigned, notifyReferentsHandback } from "./notifications";

/**
 * Suivi des nouveaux convertis MSDP (ex-`integration`, spec 052). L'accès passe par
 * `getCareAccess` (T7), sans reprendre l'approximation de rôle `members:manage`/`events:manage`
 * de l'ancien `hasMsdpManagementAccess` (décision #583). Depuis le lot 2, l'affectation choisit
 * entre profil pastoral et membre du MSDP (`followup-state.ts`), réservée au référent ; les
 * étapes de suivi sont réservées à l'accompagnant en charge.
 */

export type { FollowupPatchBody as MsdpPatchBody } from "./followup-state";
export { followupPatchSchema as msdpPatchSchema } from "./followup-state";

// ─── Access control ──────────────────────────────────────────────────────────

/** Membre d'un département de fonction MSDP — réplique `isMsdpMember` (ex-`integration/auth`)
 *  sans importer un autre module (ADR-0001) : repose sur `getFunctionDepartmentIds`, infra
 *  partagée hors des modules. */
export async function isMsdpTeamMember(session: Session, churchId: string): Promise<boolean> {
  const userDeptIds = session.user.churchRoles
    .filter((r) => r.churchId === churchId)
    .flatMap((r) => r.departments.map((d) => d.department.id));
  if (userDeptIds.length === 0) return false;
  const msdpDeptIds = await getFunctionDepartmentIds(churchId, DEPT_FN.MSDP);
  return msdpDeptIds.some((id) => userDeptIds.includes(id));
}

/** Membre d'un département de fonction INTEGRATION — réplique `isIntegrationMember`, même
 *  raison que `isMsdpTeamMember` ci-dessus. */
export async function isIntegrationTeamMember(session: Session, churchId: string): Promise<boolean> {
  const userDeptIds = session.user.churchRoles
    .filter((r) => r.churchId === churchId)
    .flatMap((r) => r.departments.map((d) => d.department.id));
  if (userDeptIds.length === 0) return false;
  const integrationDeptIds = await getFunctionDepartmentIds(churchId, DEPT_FN.INTEGRATION);
  return integrationDeptIds.some((id) => userDeptIds.includes(id));
}

/**
 * Droit de gérer un suivi MSDP (toutes les actions) : `care:qualify`, ou membre d'un
 * département de fonction MSDP (l'équipe gère aujourd'hui l'ensemble des suivis, pas
 * seulement le sien — comportement conservé pour le lot 1).
 */
export async function hasFollowupManagementAccess(
  session: Session,
  churchId: string
): Promise<boolean> {
  const access = await getCareAccess(session, churchId);
  if (access.canQualify) return true;
  return isMsdpTeamMember(session, churchId);
}

/**
 * Droit de démarrer manuellement un suivi (issue #550, conservé — plan.md « démarrage manuel
 * conservé ») : `care:qualify`, équipe intégration, ou équipe MSDP.
 */
export async function canStartFollowUp(session: Session, churchId: string): Promise<boolean> {
  if (await hasFollowupManagementAccess(session, churchId)) return true;
  return isIntegrationTeamMember(session, churchId);
}

// ─── Services ─────────────────────────────────────────────────────────────────

const FOLLOWUP_INCLUDE = {
  assignedConseillerMsdp: { select: { id: true, name: true, email: true } },
  assignedProfile: { select: { id: true, name: true, role: true, userId: true } },
  request: { select: { id: true, firstName: true, lastName: true } },
} as const;

export async function listMsdpFollowUps(churchId: string) {
  return prisma.msdpFollowUp.findMany({
    where: { churchId },
    include: FOLLOWUP_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getMsdpFollowUpById(id: string) {
  return prisma.msdpFollowUp.findUnique({ where: { id }, include: FOLLOWUP_INCLUDE });
}

/** Suivi MSDP né d'une demande d'accueil donnée (T26, fiche d'accueil), s'il existe. */
export async function getMsdpFollowUpByIntegrationRequestId(integrationRequestId: string) {
  return prisma.msdpFollowUp.findUnique({
    where: { requestId: integrationRequestId },
    include: FOLLOWUP_INCLUDE,
  });
}

/**
 * Démarrage manuel d'un suivi depuis une demande d'accueil (issue #550), sans appel au salut
 * coché : identité recopiée depuis la demande, comme le ferait l'intake automatique.
 */
export async function startMsdpFollowUpFromIntegrationRequest(params: {
  integrationRequestId: string;
  churchId: string;
}) {
  const { integrationRequestId, churchId } = params;

  const req = await prisma.familyIntegrationRequest.findUnique({
    where: { id: integrationRequestId },
    select: {
      id: true,
      churchId: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      msdpFollowUp: { select: { id: true } },
    },
  });
  if (!req || req.churchId !== churchId) throw new ApiError(404, "Demande introuvable");
  if (req.msdpFollowUp) throw new ApiError(409, "Un suivi MSDP existe déjà pour cette demande");

  return prisma.msdpFollowUp.create({
    data: {
      churchId,
      requestId: req.id,
      firstName: req.firstName,
      lastName: req.lastName,
      phone: req.phone,
      email: req.email,
      status: "SUBMITTED",
    },
    include: FOLLOWUP_INCLUDE,
  });
}

/**
 * Issue « orienté vers un suivi de nouveau converti » (T41) : un rendez-vous clôturé avec
 * l'issue `REFERRED_TO_FOLLOWUP` fait naître un suivi, avec l'identité et le dossier de
 * parcours du rendez-vous. Idempotent (`sourceAppointmentId` unique) : une réémission ne crée
 * rien de plus.
 */
export async function createFollowUpFromAppointmentOrientation(params: {
  appointmentId: string;
  churchId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  personJourneyId: string | null;
}) {
  return prisma.msdpFollowUp.upsert({
    where: { sourceAppointmentId: params.appointmentId },
    update: {},
    create: {
      churchId: params.churchId,
      sourceAppointmentId: params.appointmentId,
      firstName: params.firstName,
      lastName: params.lastName,
      phone: params.phone,
      email: params.email,
      personJourneyId: params.personJourneyId,
      status: "SUBMITTED",
    },
  });
}

/**
 * Applique une transition (assign/reassign/contact/in_formation/complete/abandon/reopen/
 * handback/note), calcule les notifications et journalise l'historique (T40, T42, T43).
 */
export async function applyFollowupTransition(params: {
  id: string;
  churchId: string;
  body: FollowupPatchBody;
  actorId: string;
  isReferent: boolean;
}) {
  const { id, churchId, body, actorId, isReferent } = params;

  const existing = await prisma.msdpFollowUp.findFirst({
    where: { id, churchId },
    include: FOLLOWUP_INCLUDE,
  });
  if (!existing) throw new ApiError(404, "Suivi introuvable");

  const currentAssigneeUserId = existing.assignedConseillerMsdpId ?? existing.assignedProfile?.userId ?? null;
  const isCurrentAssignee = !!currentAssigneeUserId && currentAssigneeUserId === actorId;

  const actor: FollowupActor = { isReferent, isCurrentAssignee };

  let assignee: ResolvedAssignee | null = null;
  if (body.action === "assign" || body.action === "reassign") {
    assignee = await resolveAssignee(churchId, body.assignee);
  }

  const now = new Date();
  const result = computeFollowupTransitionData(
    {
      status: existing.status,
      assignedProfileId: existing.assignedProfileId,
      assignedConseillerMsdpId: existing.assignedConseillerMsdpId,
    },
    body,
    actor,
    now,
    actorId,
    assignee
  );

  const updated = await prisma.msdpFollowUp.update({
    where: { id },
    data: result.data,
    include: FOLLOWUP_INCLUDE,
  });

  const personName = `${existing.firstName} ${existing.lastName}`;

  await recordCareHistory({
    userId: actorId,
    churchId,
    kind: "followups",
    itemId: id,
    action: body.action,
    from: existing.status,
    to: typeof result.data.status === "string" ? result.data.status : existing.status,
    assignee: assignee?.name ?? null,
    note: body.action === "handback" ? body.reason : body.action === "note" ? body.notes : null,
  });

  if (result.notifyAssigned) {
    await notifyAssigneeAssigned({ assignee: result.notifyAssigned, kind: "followups", itemId: id, personName });
  }
  if (result.notifyPreviousAssignee && currentAssigneeUserId) {
    await notifyAssigneeUnassigned({ userId: currentAssigneeUserId, kind: "followups", personName });
  }
  if (result.notifyReferents) {
    await notifyReferentsHandback({
      churchId,
      kind: "followups",
      itemId: id,
      personName,
      reason: body.action === "handback" ? body.reason : "",
    });
  }

  return updated;
}

/**
 * Membres du MSDP assignables comme accompagnants (T18, `GET /api/care/companions`) — vivier
 * d'appartenance (`Member.departments`, ADR-0013), pas de responsabilité (`user_departments`) :
 * reprise à l'identique de l'ancien `integration/msdp/counselors`. Le vivier profils pastoraux
 * s'y ajoute au lot 2.
 */
export async function listMsdpCounselors(churchId: string) {
  const msdpMembers = await prisma.member.findMany({
    where: {
      departments: {
        some: { department: { function: DEPT_FN.MSDP, ministry: { churchId } } },
      },
    },
    select: {
      userLinks: {
        where: { churchId, validatedAt: { not: null } },
        select: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
  });

  const seenIds = new Set<string>();
  const counselors: { id: string; name: string | null; email: string | null; image: string | null }[] = [];
  for (const m of msdpMembers) {
    for (const link of m.userLinks) {
      if (!seenIds.has(link.user.id)) {
        seenIds.add(link.user.id);
        counselors.push(link.user);
      }
    }
  }
  counselors.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  return counselors;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export function buildMsdpCounselorNotifEmail(params: {
  counselorName: string;
  personName: string;
  followUpId: string;
  appUrl: string;
}): string {
  const { counselorName, personName, followUpId, appUrl } = params;
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#5E17EB;padding:28px 32px 20px">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">Nouveau suivi MSDP assigné</h1>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 14px;color:#111827;font-size:15px">Bonjour ${counselorName},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6">
        Un suivi MSDP vient de vous être confié :
      </p>
      <div style="background:#f5f3ff;border-left:4px solid #5E17EB;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px">
        <p style="margin:0;color:#111827;font-size:15px;font-weight:600">${personName}</p>
      </div>
      <a href="${appUrl}/care/followups/${followUpId}"
         style="display:inline-block;background:#5E17EB;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">
        Voir le suivi →
      </a>
    </div>
    <div style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;color:#9ca3af;font-size:11px">Notification automatique Koinonia.</p>
    </div>
  </div>
</body>
</html>`;
}

export async function notifyMsdpCounselorAssigned(params: {
  counselorId: string;
  followUpId: string;
  personName: string;
  appUrl: string;
}): Promise<void> {
  const { counselorId, followUpId, personName, appUrl } = params;

  // Toujours un compte (membre du MSDP ou profil pastoral rattaché) : email gouverné par la
  // préférence du domaine "care" (spec 053), via le helper partagé.
  const counselor = await prisma.user.findUnique({
    where: { id: counselorId },
    select: { name: true, email: true },
  });

  await createNotification(
    {
      userId: counselorId,
      domain: "care",
      type: "CARE_MSDP_ASSIGNED",
      title: "Nouveau suivi MSDP assigné",
      message: `Vous êtes désigné comme référent pour le suivi de ${personName}.`,
      link: `/care/followups/${followUpId}`,
    },
    counselor?.email
      ? {
          email: {
            subject: "Un suivi MSDP vous a été confié",
            html: buildMsdpCounselorNotifEmail({
              counselorName: counselor.name ?? counselor.email,
              personName,
              followUpId,
              appUrl,
            }),
          },
        }
      : undefined
  ).catch(() => {});
}

// ─── Inactivité ───────────────────────────────────────────────────────────────

const MSDP_INACTIVITY_DAYS = 7;
const MSDP_INACTIVITY_NOTIF_TYPE = "CARE_MSDP_INACTIVITY";

export function buildMsdpInactivityEmail(params: {
  churchName: string;
  personName: string;
  status: string;
  daysSince: number;
  link: string;
  appUrl: string;
}): string {
  const { churchName, personName, status, daysSince, link, appUrl } = params;
  const contextMap: Record<string, string> = {
    SUBMITTED: "Aucun référent n'a encore été désigné pour ce suivi.",
    ASSIGNED: "Un référent a été désigné mais le contact n'a pas encore été établi.",
    CONTACTED: "Le contact a été établi mais la formation n'a pas encore démarré.",
    IN_FORMATION: "La personne est en formation mais aucune progression récente n'a été enregistrée.",
  };
  const context = contextMap[status] ?? "Aucune mise à jour récente.";
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#5E17EB;padding:28px 32px">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${churchName}</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px">Rappel — Suivi MSDP</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 12px;color:#111827;font-size:15px">Bonjour,</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6">
        Le suivi MSDP de <strong>${personName}</strong> est inactif depuis <strong>${daysSince} jours</strong>.
      </p>
      <div style="background:#fff7ed;border-left:4px solid #f97316;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px">
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5">${context}</p>
      </div>
      <a href="${appUrl}${link}" style="display:inline-block;background:#5E17EB;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">
        Voir le suivi →
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

export async function runMsdpInactivityNotifications(
  appUrl: string
): Promise<{ notified: number; skipped: number; total: number }> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - MSDP_INACTIVITY_DAYS);

  const dedupeThreshold = new Date();
  dedupeThreshold.setDate(dedupeThreshold.getDate() - MSDP_INACTIVITY_DAYS);

  const staleFollowUps = await prisma.msdpFollowUp.findMany({
    where: {
      status: { in: ["SUBMITTED", "ASSIGNED", "CONTACTED", "IN_FORMATION"] },
      updatedAt: { lt: threshold },
    },
    include: {
      assignedConseillerMsdp: { select: { id: true, name: true, email: true } },
      request: { select: { firstName: true, lastName: true } },
      church: { select: { id: true, name: true } },
    },
  });

  if (staleFollowUps.length === 0) return { notified: 0, skipped: 0, total: 0 };

  const followUpIds = staleFollowUps.map((f) => f.id);
  const recentNotifs = await prisma.notification.findMany({
    where: {
      type: MSDP_INACTIVITY_NOTIF_TYPE,
      link: { in: followUpIds.map((id) => `/care/followups/${id}`) },
      createdAt: { gte: dedupeThreshold },
    },
    select: { link: true },
  });
  const alreadyNotifiedLinks = new Set(recentNotifs.map((n) => n.link));

  const managersByChurch: Record<string, { id: string; email: string | null }[]> = {};

  async function getMsdpManagers(churchId: string) {
    if (managersByChurch[churchId]) return managersByChurch[churchId];
    const msdpDeptIds = await getFunctionDepartmentIds(churchId, DEPT_FN.MSDP);
    if (msdpDeptIds.length === 0) { managersByChurch[churchId] = []; return []; }
    const memberships = await prisma.userDepartment.findMany({
      where: { departmentId: { in: msdpDeptIds } },
      include: { userChurchRole: { select: { userId: true, user: { select: { id: true, email: true } } } } },
    });
    const managersById = new Map(
      memberships.map((m) => [m.userChurchRole.userId, { id: m.userChurchRole.userId, email: m.userChurchRole.user.email }])
    );
    const managers = Array.from(managersById.values());
    managersByChurch[churchId] = managers;
    return managers;
  }

  const titleMap: Record<string, string> = {
    SUBMITTED: "Suivi sans référent depuis 7 jours",
    ASSIGNED: "Contact non établi depuis 7 jours",
    CONTACTED: "Formation non démarrée depuis 7 jours",
    IN_FORMATION: "Suivi en formation sans progression depuis 7 jours",
  };

  let notified = 0;
  let skipped = 0;

  for (const followUp of staleFollowUps) {
    const link = `/care/followups/${followUp.id}`;
    if (alreadyNotifiedLinks.has(link)) { skipped++; continue; }

    const personName = `${followUp.request?.firstName ?? ""} ${followUp.request?.lastName ?? ""}`.trim();
    const daysSince = Math.floor((Date.now() - followUp.updatedAt.getTime()) / 86_400_000);
    const title = titleMap[followUp.status] ?? "Suivi MSDP inactif";
    const message = `${personName} — aucune mise à jour depuis ${daysSince} jours.`;

    // Toujours des comptes (membre du MSDP, ou compte rattaché au profil pastoral) : email
    // gouverné par la préférence du domaine "care" (spec 053), via le helper partagé.
    if (followUp.assignedConseillerMsdp) {
      await createNotification(
        { userId: followUp.assignedConseillerMsdp.id, domain: "care", type: MSDP_INACTIVITY_NOTIF_TYPE, title, message, link },
        followUp.assignedConseillerMsdp.email
          ? {
              email: {
                subject: `${followUp.church.name} — ${title}`,
                html: buildMsdpInactivityEmail({ churchName: followUp.church.name, personName, status: followUp.status, daysSince, link, appUrl }),
              },
            }
          : undefined
      ).catch(() => {});
      notified++;
    } else {
      const managers = await getMsdpManagers(followUp.churchId);
      if (managers.length > 0) {
        await notifyUsers(
          managers.map((m) => m.id),
          { domain: "care", type: MSDP_INACTIVITY_NOTIF_TYPE, title, message, link },
          {
            email: {
              subject: `${followUp.church.name} — ${title}`,
              html: buildMsdpInactivityEmail({ churchName: followUp.church.name, personName, status: followUp.status, daysSince, link, appUrl }),
            },
          }
        ).catch(() => {});
        notified += managers.length;
      }
    }
  }

  return { notified, skipped, total: staleFollowUps.length };
}
