import { prisma } from "@/lib/prisma";
import { rolePermissions } from "@/lib/registry";
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
