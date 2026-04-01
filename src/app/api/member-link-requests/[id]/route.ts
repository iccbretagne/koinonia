import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { Role } from "@/generated/prisma/client";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectReason: z.string().optional(),
  departmentId: z.string().optional(), // override admin si besoin
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
    const { action, rejectReason, departmentId: adminDeptOverride } = schema.parse(body);

    const linkRequest = await prisma.memberLinkRequest.findUnique({
      where: { id },
      include: {
        member: true,
        department: true,
        ministry: true,
      },
    });
    if (!linkRequest) throw new ApiError(404, "Demande introuvable");
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

    await prisma.$transaction(async (tx) => {
      let memberId = linkRequest.memberId;
      let memberName: { firstName: string; lastName: string } | null = null;

      // ── Créer le Member si nouveau STAR ──────────────────────────────────────
      if (isNewStar && !isNoStarRole) {
        const dept = await tx.department.findUnique({
          where: { id: effectiveDeptId! },
          include: { ministry: { select: { churchId: true } } },
        });
        if (!dept || dept.ministry.churchId !== linkRequest.churchId) {
          throw new ApiError(400, "Ce département n'appartient pas à cette église");
        }

        const newMember = await tx.member.create({
          data: {
            firstName: linkRequest.firstName!,
            lastName: linkRequest.lastName!,
            phone: linkRequest.phone ?? undefined,
            departments: { create: { departmentId: effectiveDeptId!, isPrimary: true } },
          },
        });
        memberId = newMember.id;
        memberName = { firstName: newMember.firstName, lastName: newMember.lastName };
      } else if (linkRequest.member) {
        memberName = { firstName: linkRequest.member.firstName, lastName: linkRequest.member.lastName };
      }

      // ── Créer MemberUserLink (sauf rôle sans STAR) ───────────────────────────
      if (!isNoStarRole && memberId) {
        await tx.memberUserLink.create({
          data: {
            memberId,
            userId: linkRequest.userId,
            churchId: linkRequest.churchId,
            validatedAt: new Date(),
            validatedById: session.user.id,
          },
        });
      }

      // ── Mettre à jour le displayName ─────────────────────────────────────────
      if (memberName) {
        await tx.user.update({
          where: { id: linkRequest.userId },
          data: { displayName: `${memberName.firstName} ${memberName.lastName}` },
        });
      }

      // ── Créer le rôle selon requestedRole ────────────────────────────────────
      if (requestedRole) {
        const prismaRole = (requestedRole === "DEPUTY" ? "DEPARTMENT_HEAD" : requestedRole) as Role;
        const existingRole = await tx.userChurchRole.findFirst({
          where: {
            userId: linkRequest.userId,
            churchId: linkRequest.churchId,
            role: prismaRole,
          },
        });

        if (requestedRole === "MINISTER") {
          if (!effectiveMinistryId) throw new ApiError(400, "Le ministère est requis pour le rôle Ministre");
          if (existingRole) {
            await tx.userChurchRole.update({
              where: { id: existingRole.id },
              data: { ministryId: effectiveMinistryId },
            });
          } else {
            await tx.userChurchRole.create({
              data: {
                userId: linkRequest.userId,
                churchId: linkRequest.churchId,
                role: "MINISTER",
                ministryId: effectiveMinistryId,
              },
            });
          }
        } else if (requestedRole === "DEPARTMENT_HEAD" || requestedRole === "DEPUTY") {
          if (!effectiveDeptId) throw new ApiError(400, "Le département est requis pour ce rôle");
          const isDeputy = requestedRole === "DEPUTY";

          if (existingRole) {
            await tx.userDepartment.create({
              data: {
                userChurchRoleId: existingRole.id,
                departmentId: effectiveDeptId,
                isDeputy,
              },
            });
          } else {
            await tx.userChurchRole.create({
              data: {
                userId: linkRequest.userId,
                churchId: linkRequest.churchId,
                role: "DEPARTMENT_HEAD",
                departments: {
                  create: { departmentId: effectiveDeptId, isDeputy },
                },
              },
            });
          }
        } else if (requestedRole === "DISCIPLE_MAKER" || requestedRole === "REPORTER") {
          if (!existingRole) {
            await tx.userChurchRole.create({
              data: {
                userId: linkRequest.userId,
                churchId: linkRequest.churchId,
                role: prismaRole,
              },
            });
          }
        }
      }

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
    return successResponse({ approved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
