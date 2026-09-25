import { z } from "zod";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { sendEmail } from "@/lib/email";
import { DEPT_FN } from "@/lib/department-functions";
import { getFunctionDepartmentIds } from "@/lib/function-departments";
import { getCareAccess } from "../auth";

/**
 * Reprise à l'identique du suivi des nouveaux convertis MSDP (ex-`integration`, spec 052/lot 1) :
 * même schéma de transitions, mêmes notifications, mêmes rappels d'inactivité. Seul l'accès
 * change de garde (`getCareAccess`, T7) — sans reprendre l'approximation de rôle
 * `members:manage`/`events:manage` de l'ancien `hasMsdpManagementAccess` (décision #583).
 * L'affectation à un profil pastoral, l'identité propre et le rapprochement de parcours
 * arrivent au lot 2 ; le suivi garde ici son affectation à un membre du MSDP uniquement.
 */

export const msdpPatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign_counselor"),
    counselorId: z.string().min(1),
  }),
  z.object({ action: z.literal("contact") }),
  z.object({ action: z.literal("in_formation") }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("abandon") }),
  z.object({ action: z.literal("reopen") }),
  z.object({
    action: z.literal("note"),
    notes: z.string().max(10000),
  }),
]);

export type MsdpPatchBody = z.infer<typeof msdpPatchSchema>;

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

// ─── Transition logic ────────────────────────────────────────────────────────

export function computeMsdpTransitionData(
  followUp: { status: string },
  body: MsdpPatchBody,
  now: Date
): Record<string, unknown> {
  switch (body.action) {
    case "assign_counselor":
      return { status: "ASSIGNED", assignedConseillerMsdpId: body.counselorId, assignedAt: now };

    case "contact":
      if (followUp.status !== "ASSIGNED")
        throw new ApiError(400, "Transition invalide : le suivi doit être ASSIGNED");
      return { status: "CONTACTED", contactedAt: now };

    case "in_formation":
      if (followUp.status !== "CONTACTED")
        throw new ApiError(400, "Transition invalide : le suivi doit être CONTACTED");
      return { status: "IN_FORMATION", inFormationAt: now };

    case "complete":
      if (followUp.status !== "IN_FORMATION")
        throw new ApiError(400, "Transition invalide : le suivi doit être IN_FORMATION");
      return { status: "COMPLETED", completedAt: now };

    case "abandon":
      if (followUp.status === "COMPLETED")
        throw new ApiError(400, "Impossible d'abandonner un suivi terminé");
      return { status: "ABANDONED", abandonedAt: now };

    case "reopen":
      if (followUp.status !== "ABANDONED")
        throw new ApiError(400, "Seul un suivi abandonné peut être rouvert");
      return { status: "SUBMITTED", abandonedAt: null };

    case "note":
      return { notes: body.notes };
  }
}

// ─── Services ─────────────────────────────────────────────────────────────────

const FOLLOWUP_INCLUDE = {
  assignedConseillerMsdp: { select: { id: true, name: true, email: true } },
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

export async function applyMsdpTransition(params: {
  id: string;
  churchId: string;
  body: MsdpPatchBody;
  actorId: string;
}) {
  const { id, churchId, body, actorId } = params;

  const existing = await prisma.msdpFollowUp.findFirst({
    where: { id, churchId },
    select: { status: true },
  });
  if (!existing) throw new ApiError(404, "Suivi introuvable");

  const data = computeMsdpTransitionData(existing, body, new Date());
  const updated = await prisma.msdpFollowUp.update({
    where: { id },
    data: { ...data, assignedById: body.action === "assign_counselor" ? actorId : undefined },
    include: FOLLOWUP_INCLUDE,
  });

  if (body.action === "assign_counselor") {
    await notifyMsdpCounselorAssigned({
      counselorId: body.counselorId,
      followUpId: id,
      personName: `${updated.firstName} ${updated.lastName}`,
      appUrl: process.env.NEXTAUTH_URL ?? "",
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
  await prisma.notification
    .create({
      data: {
        userId: counselorId,
        type: "CARE_MSDP_ASSIGNED",
        title: "Nouveau suivi MSDP assigné",
        message: `Vous avez été assigné comme conseiller MSDP pour ${personName}.`,
        link: `/care/followups/${followUpId}`,
      },
    })
    .catch(() => {});

  const counselor = await prisma.user.findUnique({
    where: { id: counselorId },
    select: { name: true, email: true },
  });

  if (counselor?.email) {
    await sendEmail({
      to: counselor.email,
      subject: "Un suivi MSDP vous a été confié",
      html: buildMsdpCounselorNotifEmail({
        counselorName: counselor.name ?? counselor.email,
        personName,
        followUpId,
        appUrl,
      }),
    }).catch(() => {});
  }
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
    SUBMITTED: "Aucun conseiller n'a encore été assigné à ce suivi.",
    ASSIGNED: "Un conseiller a été assigné mais le contact n'a pas encore été établi.",
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
    SUBMITTED: "Suivi sans conseiller depuis 7 jours",
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

    if (followUp.assignedConseillerMsdp) {
      await prisma.notification.create({
        data: { userId: followUp.assignedConseillerMsdp.id, type: MSDP_INACTIVITY_NOTIF_TYPE, title, message, link },
      }).catch(() => {});
      notified++;
      if (process.env.SMTP_HOST && followUp.assignedConseillerMsdp.email) {
        await sendEmail({
          to: followUp.assignedConseillerMsdp.email,
          subject: `${followUp.church.name} — ${title}`,
          html: buildMsdpInactivityEmail({ churchName: followUp.church.name, personName, status: followUp.status, daysSince, link, appUrl }),
        }).catch(() => {});
      }
    } else {
      const managers = await getMsdpManagers(followUp.churchId);
      for (const manager of managers) {
        await prisma.notification.create({
          data: { userId: manager.id, type: MSDP_INACTIVITY_NOTIF_TYPE, title, message, link },
        }).catch(() => {});
        notified++;
        if (process.env.SMTP_HOST && manager.email) {
          await sendEmail({
            to: manager.email,
            subject: `${followUp.church.name} — ${title}`,
            html: buildMsdpInactivityEmail({ churchName: followUp.church.name, personName, status: followUp.status, daysSince, link, appUrl }),
          }).catch(() => {});
        }
      }
    }
  }

  return { notified, skipped, total: staleFollowUps.length };
}
