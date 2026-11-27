import type { Session } from "next-auth";
import { requireAuth, requireCurrentChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import type { CampaignAssignmentStatus, CampaignStatus } from "@/generated/prisma/client";
import { hashToken, matchesHash, isTokenShape } from "./services/tokens";

/**
 * Gardes du module campaigns (spec 090). L'église qui fait foi est celle **de la campagne**, jamais
 * l'église affichée. Gestionnaires et répondants sont des **données** vérifiées objet par objet ;
 * seule la création d'une campagne passe par la permission `campaigns:manage`. Un objet d'une autre
 * église, inexistant ou hors des droits de l'appelant donne le même 404.
 */

const NOT_FOUND = "Campagne introuvable";
const ASSIGNMENT_NOT_FOUND = "Questionnaire introuvable";

/** Qui agit : un compte, ou un répondant sans compte authentifié par son lien. */
export type CampaignActor =
  | { kind: "user"; userId: string; name: string; session: Session }
  | { kind: "token"; respondentId: string; name: string };

export const userActor = (session: Session): CampaignActor => ({
  kind: "user",
  userId: session.user.id,
  name: session.user.displayName ?? session.user.name ?? session.user.email,
  session,
});

/** Le compte a-t-il un rôle dans l'église (ou est-il Super Admin) ? */
export function isChurchMember(session: Session, churchId: string): boolean {
  return session.user.isSuperAdmin === true || session.user.churchRoles.some((r) => r.churchId === churchId);
}

/** `campaigns:manage` dans cette église (Super Admin compris). */
export async function hasCampaignsManage(session: Session, churchId: string): Promise<boolean> {
  if (session.user.isSuperAdmin) return true;
  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) return false;
  const { rolePermissions } = await import("@/lib/registry");
  return roles.some((r) => (rolePermissions[r.role] ?? []).includes("campaigns:manage"));
}

/**
 * Gestionnaire d'une campagne : `campaigns:manage` dans l'église de la campagne, ou gestionnaire
 * désigné (toujours membre de l'église).
 */
export async function isCampaignManager(session: Session, campaign: { id: string; churchId: string }): Promise<boolean> {
  if (await hasCampaignsManage(session, campaign.churchId)) return true;
  if (!isChurchMember(session, campaign.churchId)) return false;
  const row = await prisma.campaignManager.findUnique({
    where: { campaignId_userId: { campaignId: campaign.id, userId: session.user.id } },
    select: { userId: true },
  });
  return !!row;
}

export interface ManagedCampaign {
  id: string;
  churchId: string;
  status: CampaignStatus;
  title: string;
  key: string;
}

/** Gestionnaire de la campagne ; 404 sinon. */
export async function requireCampaignManager(campaignId: string): Promise<{ session: Session; campaign: ManagedCampaign }> {
  const session = await requireAuth();
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, churchId: true, status: true, title: true, key: true },
  });
  if (!campaign || !(await isCampaignManager(session, campaign))) throw new ApiError(404, NOT_FOUND);
  return { session, campaign };
}

/** Création d'une campagne : `campaigns:manage` dans l'église courante. */
export async function requireCampaignsManage() {
  return requireCurrentChurchPermission("campaigns:manage");
}

export interface AssignmentContext {
  id: string;
  churchId: string;
  campaignId: string;
  formId: string;
  status: CampaignAssignmentStatus;
  campaignStatus: CampaignStatus;
}

export type AssignmentAccess =
  | { role: "manager"; actor: CampaignActor; assignment: AssignmentContext }
  | { role: "respondent"; actor: CampaignActor; assignment: AssignmentContext; respondentId: string };

const ASSIGNMENT_SELECT = {
  id: true,
  churchId: true,
  campaignId: true,
  formId: true,
  status: true,
  campaign: { select: { status: true, churchId: true } },
} as const;

type LoadedAssignment = {
  id: string;
  churchId: string;
  campaignId: string;
  formId: string;
  status: CampaignAssignmentStatus;
  campaign: { status: CampaignStatus; churchId: string };
};

const context = (a: LoadedAssignment): AssignmentContext => ({
  id: a.id,
  churchId: a.campaign.churchId,
  campaignId: a.campaignId,
  formId: a.formId,
  status: a.status,
  campaignStatus: a.campaign.status,
});

/**
 * Droits d'un compte sur une affectation : gestionnaire de la campagne, ou répondant désigné
 * (membre de l'église, campagne sortie du brouillon). Sinon null.
 */
export async function getAssignmentAccess(session: Session, assignmentId: string): Promise<AssignmentAccess | null> {
  const a = await prisma.campaignAssignment.findUnique({ where: { id: assignmentId }, select: ASSIGNMENT_SELECT });
  if (!a) return null;
  const actor = userActor(session);
  if (await isCampaignManager(session, { id: a.campaignId, churchId: a.campaign.churchId })) {
    return { role: "manager", actor, assignment: context(a) };
  }
  if (a.campaign.status === "DRAFT" || !isChurchMember(session, a.campaign.churchId)) return null;
  const respondent = await prisma.campaignRespondent.findUnique({
    where: { assignmentId_userId: { assignmentId, userId: session.user.id } },
    select: { id: true },
  });
  if (!respondent) return null;
  return { role: "respondent", actor, assignment: context(a), respondentId: respondent.id };
}

/** Gestionnaire ou répondant connecté ; 404 sinon. */
export async function requireAssignmentAccess(assignmentId: string): Promise<AssignmentAccess> {
  const session = await requireAuth();
  const access = await getAssignmentAccess(session, assignmentId);
  if (!access) throw new ApiError(404, ASSIGNMENT_NOT_FOUND);
  return access;
}

/** Gestionnaire de la campagne de cette affectation ; 404 sinon. */
export async function requireAssignmentManager(assignmentId: string): Promise<AssignmentAccess & { role: "manager" }> {
  const access = await requireAssignmentAccess(assignmentId);
  if (access.role !== "manager") throw new ApiError(404, ASSIGNMENT_NOT_FOUND);
  return access;
}

/**
 * Répondant sans compte, par son lien personnel. Le lien ne vaut que pour une campagne ouverte :
 * brouillon, clôture ou lien régénéré ⇒ 404, sans distinguer la cause.
 */
export async function requireTokenAccess(token: string): Promise<AssignmentAccess & { role: "respondent" }> {
  if (!isTokenShape(token)) throw new ApiError(404, "Lien invalide ou expiré");
  const respondent = await prisma.campaignRespondent.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, name: true, tokenHash: true, assignment: { select: ASSIGNMENT_SELECT } },
  });
  if (!respondent?.tokenHash || !matchesHash(token, respondent.tokenHash) || respondent.assignment.campaign.status !== "OPEN") {
    throw new ApiError(404, "Lien invalide ou expiré");
  }
  return {
    role: "respondent",
    actor: { kind: "token", respondentId: respondent.id, name: respondent.name ?? "Répondant" },
    assignment: context(respondent.assignment),
    respondentId: respondent.id,
  };
}

/** États dans lesquels les répondants peuvent encore saisir. */
export const EDITABLE_STATUSES: readonly CampaignAssignmentStatus[] = ["NOT_STARTED", "IN_PROGRESS", "CHANGES_REQUESTED"];

/** La saisie est-elle ouverte (campagne ouverte, questionnaire non soumis) ? */
export function canEdit(a: Pick<AssignmentContext, "status" | "campaignStatus">): boolean {
  return a.campaignStatus === "OPEN" && EDITABLE_STATUSES.includes(a.status);
}

/** Saisie ouverte, sinon 409 avec un message clair. */
export function assertEditable(a: Pick<AssignmentContext, "status" | "campaignStatus">): void {
  if (a.campaignStatus !== "OPEN") throw new ApiError(409, "La campagne n'est pas ouverte à la saisie");
  if (!EDITABLE_STATUSES.includes(a.status)) throw new ApiError(409, "Ce questionnaire a été soumis : il n'est plus modifiable");
}
