import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId, getUserMinistryScope } from "@/lib/auth";
import { resolveMemberDepartmentScope, isLinkRequestInScope } from "@/lib/member-scope";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { findDuplicateCandidates } from "@/lib/onboarding";
import { admitToChurch } from "@/lib/admission";
import { createNotification } from "@/lib/notifications";
import type { Session } from "next-auth";
import { schema } from "./contract";

type LinkRequest = {
  id: string;
  userId: string;
  status: string;
  departmentId: string | null;
  ministryId: string | null;
  member: { departments: { departmentId: string }[] } | null;
};

/** La demande (et le département imposé, le cas échéant) doit relever du périmètre de l'appelant. */
async function assertRequestInScope(
  session: Session,
  churchId: string,
  linkRequest: LinkRequest,
  adminDeptOverride: string | undefined
) {
  const memberScope = await resolveMemberDepartmentScope(session, churchId);
  const ministryScope = getUserMinistryScope(session, churchId);
  const inScope = isLinkRequestInScope(
    memberScope,
    ministryScope.scoped ? ministryScope.ministryIds : [],
    { departmentId: linkRequest.departmentId, ministryId: linkRequest.ministryId },
    linkRequest.member?.departments.map((d) => d.departmentId) ?? []
  );
  if (!inScope) throw new ApiError(403, "Cette demande est hors de votre périmètre");
  if (adminDeptOverride && memberScope.scoped && !memberScope.departmentIds.includes(adminDeptOverride)) {
    throw new ApiError(403, "Ce département est hors de votre périmètre");
  }
}

async function reconsiderRequest(linkRequest: LinkRequest, userId: string, churchId: string) {
  if (linkRequest.status !== "REJECTED") {
    throw new ApiError(409, "Seules les demandes refusées peuvent être reconsidérées");
  }
  const updated = await prisma.memberLinkRequest.update({
    where: { id: linkRequest.id },
    data: { status: "PENDING", rejectReason: null, reviewedAt: null, reviewedById: null },
  });
  await logAudit({ userId, churchId, action: "UPDATE", entityType: "MemberLinkRequest", entityId: linkRequest.id, details: { action: "reconsider" } });
  return updated;
}

/** Refus, motivé ou non, notifié au demandeur. */
async function rejectRequest(linkRequest: LinkRequest, rejectReason: string | undefined, userId: string, churchId: string) {
  const updated = await prisma.memberLinkRequest.update({
    where: { id: linkRequest.id },
    data: {
      status: "REJECTED",
      rejectReason: rejectReason ?? null,
      reviewedAt: new Date(),
      reviewedById: userId,
    },
  });
  await logAudit({ userId, churchId, action: "UPDATE", entityType: "MemberLinkRequest", entityId: linkRequest.id, details: { action: "reject" } });

  // Notify the requester that their request was rejected
  await createNotification({
    userId: linkRequest.userId,
    domain: "account",
    type: "MEMBER_LINK_REJECTED",
    title: "Demande de liaison refusée",
    message: rejectReason
      ? `Votre demande de liaison a été refusée : ${rejectReason}`
      : "Votre demande de liaison compte STAR a été refusée.",
    link: "/profile",
  });
  return updated;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const churchId = await resolveChurchId("memberLinkRequest", id);
    // access:manage (Super Admin, Admin, Secrétaire, Ministre borné à son ministère) — remplace
    // members:manage, qui laissait tout Resp. département traiter les demandes de toute
    // l'église (spec 054/#583, défaut B4 de audit-rbac.md)
    const session = await requireChurchPermission("access:manage", churchId);

    const body = await request.json();
    const { action, rejectReason, departmentId: adminDeptOverride, confirmDuplicate } = schema.parse(body);

    const linkRequest = await prisma.memberLinkRequest.findUnique({
      where: { id },
      include: {
        member: { include: { departments: { select: { departmentId: true } } } },
        department: true,
        ministry: true,
        user: true,
      },
    });
    if (!linkRequest) throw new ApiError(404, "Demande introuvable");

    await assertRequestInScope(session, churchId, linkRequest, adminDeptOverride);

    // Reconsidérer une demande refusée → repasser en PENDING
    if (action === "reconsider") return successResponse(await reconsiderRequest(linkRequest, session.user.id, churchId));

    if (linkRequest.status !== "PENDING") {
      throw new ApiError(409, "Cette demande a déjà été traitée");
    }

    if (action === "reject") return successResponse(await rejectRequest(linkRequest, rejectReason, session.user.id, churchId));

    // ── Approbation ────────────────────────────────────────────────────────────

    // Département effectif : override admin > demande > null
    const effectiveDeptId = adminDeptOverride ?? linkRequest.departmentId ?? null;
    const effectiveMinistryId = linkRequest.ministryId ?? null;
    const requestedRole = linkRequest.requestedRole;

    // Pour créer un nouveau STAR, un département est requis sauf pour les rôles sans STAR
    const isNoStarRole = requestedRole === "DISCIPLE_MAKER" || requestedRole === "REPORTER";
    const isNewStar = !linkRequest.memberId;

    if (isNewStar && !isNoStarRole && !effectiveDeptId) {
      throw new ApiError(400, "Le département est requis pour créer un STAR");
    }

    // ── Garde-fou anti-doublon avant création d'une nouvelle fiche ─────────────
    if (isNewStar && !isNoStarRole && !confirmDuplicate) {
      const duplicates = await findDuplicateCandidates(linkRequest.churchId, {
        email: linkRequest.user.email,
        firstName: linkRequest.firstName!,
        lastName: linkRequest.lastName!,
      });
      if (duplicates.length > 0) {
        return successResponse({ duplicates }, 409);
      }
    }

    await prisma.$transaction(async (tx) => {
      const { memberId } = await admitToChurch(tx, {
        userId: linkRequest.userId,
        churchId: linkRequest.churchId,
        validatedById: session.user.id,
        memberId: isNewStar ? null : linkRequest.memberId,
        newMember:
          isNewStar && !isNoStarRole
            ? {
                firstName: linkRequest.firstName!,
                lastName: linkRequest.lastName!,
                phone: linkRequest.phone,
                departmentId: effectiveDeptId!,
              }
            : undefined,
        requestedRole,
        departmentId: effectiveDeptId,
        ministryId: effectiveMinistryId,
      });

      // ── Mettre à jour la demande ──────────────────────────────────────────────
      await tx.memberLinkRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          memberId: memberId ?? undefined,
          reviewedAt: new Date(),
          reviewedById: session.user.id,
        },
      });
    });

    await logAudit({ userId: session.user.id, churchId, action: "UPDATE", entityType: "MemberLinkRequest", entityId: id, details: { action: "approve", requestedRole } });

    // Notify the requester that their request was approved
    await createNotification({
      userId: linkRequest.userId,
      domain: "account",
      type: "MEMBER_LINK_APPROVED",
      title: "Demande de liaison approuvée",
      message: "Votre compte a été lié à votre fiche STAR. Vous pouvez maintenant accéder à votre planning.",
      link: "/planning",
    });

    return successResponse({ approved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
