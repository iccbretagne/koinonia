import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { sendEmail } from "@/lib/email";
import { isIntegrationMember, isMsdpMember } from "../auth";
import { z } from "zod";
import type { Session } from "next-auth";

// ─── Schema ───────────────────────────────────────────────────────────────────

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

export async function hasMsdpManagementAccess(session: Session, churchId: string): Promise<boolean> {
  if (session.user.isSuperAdmin) return true;
  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length > 0) {
    // Import dynamique : registry.ts importe tous les modules (dont integration),
    // un import statique ici créerait un cycle qui provoque un ReferenceError
    // TDZ non déterministe au build Turbopack (cf. issue #446).
    const { rolePermissions } = await import("@/lib/registry");
    const perms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
    if (perms.has("members:manage") || perms.has("events:manage")) return true;
  }
  if (await isIntegrationMember(session, churchId)) return true;
  return isMsdpMember(session, churchId);
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

// ─── Notifications ───────────────────────────────────────────────────────────

export function buildMsdpCounselorNotifEmail(params: {
  counselorName: string;
  personName: string;
  requestId: string;
  appUrl: string;
}): string {
  const { counselorName, personName, requestId, appUrl } = params;
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
      <a href="${appUrl}/admin/integration/requests/${requestId}"
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
  requestId: string;
  personName: string;
  appUrl: string;
}): Promise<void> {
  const { counselorId, followUpId, requestId, personName, appUrl } = params;
  await prisma.notification
    .create({
      data: {
        userId: counselorId,
        type: "MSDP_ASSIGNED",
        title: "Nouveau suivi MSDP assigné",
        message: `Vous avez été assigné comme conseiller MSDP pour ${personName}.`,
        link: `/admin/integration/msdp/${followUpId}`,
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
        requestId,
        appUrl,
      }),
    }).catch(() => {});
  }
}

// ─── Inactivité ───────────────────────────────────────────────────────────────

const MSDP_INACTIVITY_DAYS = 7;
const MSDP_INACTIVITY_NOTIF_TYPE = "MSDP_INACTIVITY";

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
      link: { in: followUpIds.map((id) => `/admin/integration/msdp/${id}`) },
      createdAt: { gte: dedupeThreshold },
    },
    select: { link: true },
  });
  const alreadyNotifiedLinks = new Set(recentNotifs.map((n) => n.link));

  const managersByChurch: Record<string, { id: string; email: string | null }[]> = {};

  async function getMsdpManagers(churchId: string) {
    if (managersByChurch[churchId]) return managersByChurch[churchId];
    const msdpDept = await prisma.department.findFirst({
      where: { function: "MSDP", ministry: { churchId } },
      select: { id: true },
    });
    if (!msdpDept) { managersByChurch[churchId] = []; return []; }
    const memberships = await prisma.userDepartment.findMany({
      where: { departmentId: msdpDept.id },
      include: { userChurchRole: { select: { userId: true, user: { select: { id: true, email: true } } } } },
    });
    const managers = memberships.map((m) => ({ id: m.userChurchRole.userId, email: m.userChurchRole.user.email }));
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
    const link = `/admin/integration/msdp/${followUp.id}`;
    if (alreadyNotifiedLinks.has(link)) { skipped++; continue; }

    const personName = `${followUp.request.firstName} ${followUp.request.lastName}`;
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
