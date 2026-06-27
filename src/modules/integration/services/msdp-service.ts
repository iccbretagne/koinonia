import { prisma } from "@/lib/prisma";
import { rolePermissions } from "@/lib/registry";
import { ApiError } from "@/lib/api-utils";
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

export async function notifyMsdpCounselorAssigned(params: {
  counselorId: string;
  followUpId: string;
  personName: string;
}): Promise<void> {
  const { counselorId, followUpId, personName } = params;
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
}
