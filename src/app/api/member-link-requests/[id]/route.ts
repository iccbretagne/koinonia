import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { findDuplicateCandidates } from "@/lib/onboarding";
import { admitToChurch } from "@/lib/admission";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["approve", "reject", "reconsider"]),
  rejectReason: z.string().optional(),
  departmentId: z.string().optional(), // override admin si besoin
  confirmDuplicate: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const churchId = await resolveChurchId("memberLinkRequest", id);
    const session = await requireChurchPermission("members:manage", churchId);

    const body = await request.json();
    const { action, rejectReason, departmentId: adminDeptOverride, confirmDuplicate } = schema.parse(body);

    const linkRequest = await prisma.memberLinkRequest.findUnique({
      where: { id },
      include: {
        member: true,
        department: true,
        ministry: true,
        user: true,
      },
    });
    if (!linkRequest) throw new ApiError(404, "Demande introuvable");

    // Reconsidérer une demande refusée → repasser en PENDING
    if (action === "reconsider") {
      if (linkRequest.status !== "REJECTED") {
        throw new ApiError(409, "Seules les demandes refusées peuvent être reconsidérées");
      }
      const updated = await prisma.memberLinkRequest.update({
        where: { id },
        data: { status: "PENDING", rejectReason: null, reviewedAt: null, reviewedById: null },
      });
      await logAudit({ userId: session.user.id, churchId, action: "UPDATE", entityType: "MemberLinkRequest", entityId: id, details: { action: "reconsider" } });
      return successResponse(updated);
    }

    if (linkRequest.status !== "PENDING") {
      throw new ApiError(409, "Cette demande a déjà été traitée");
    }

    if (action === "reject") {
      const updated = await prisma.memberLinkRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectReason: rejectReason ?? null,
          reviewedAt: new Date(),
          reviewedById: session.user.id,
        },
      });
      await logAudit({ userId: session.user.id, churchId, action: "UPDATE", entityType: "MemberLinkRequest", entityId: id, details: { action: "reject" } });

      // Notify the requester that their request was rejected
      await prisma.notification.create({
        data: {
          userId: linkRequest.userId,
          type: "MEMBER_LINK_REJECTED",
          title: "Demande de liaison refusée",
          message: rejectReason
            ? `Votre demande de liaison a été refusée : ${rejectReason}`
            : "Votre demande de liaison compte STAR a été refusée.",
          link: "/profile",
        },
      });

      return successResponse(updated);
    }

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
    await prisma.notification.create({
      data: {
        userId: linkRequest.userId,
        type: "MEMBER_LINK_APPROVED",
        title: "Demande de liaison approuvée",
        message: "Votre compte a été lié à votre fiche STAR. Vous pouvez maintenant accéder à votre planning.",
        link: "/planning",
      },
    });

    return successResponse({ approved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
