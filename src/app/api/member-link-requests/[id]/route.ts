import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectReason: z.string().optional(),
  departmentId: z.string().optional(), // requis si création d'un nouveau STAR
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Résoudre l'église de la demande et vérifier la permission
    const churchId = await resolveChurchId("memberLinkRequest", id);
    const session = await requireChurchPermission("members:manage", churchId);

    const body = await request.json();
    const { action, rejectReason, departmentId } = schema.parse(body);

    const linkRequest = await prisma.memberLinkRequest.findUnique({
      where: { id },
      include: { member: true },
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
      return successResponse(updated);
    }

    // Approbation
    await prisma.$transaction(async (tx) => {
      let memberId = linkRequest.memberId;
      let memberName = linkRequest.member
        ? { firstName: linkRequest.member.firstName, lastName: linkRequest.member.lastName }
        : null;

      // Créer le Member si nouvelle demande
      if (!memberId) {
        if (!departmentId) throw new ApiError(400, "Le département est requis pour créer un STAR");

        // Vérifier que le département appartient à l'église de la demande
        const dept = await tx.department.findUnique({
          where: { id: departmentId },
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
            departmentId,
          },
        });
        memberId = newMember.id;
        memberName = { firstName: newMember.firstName, lastName: newMember.lastName };
      }

      // Créer le lien MemberUserLink
      await tx.memberUserLink.create({
        data: {
          memberId: memberId!,
          userId: linkRequest.userId,
          churchId: linkRequest.churchId,
          validatedAt: new Date(),
          validatedById: session.user.id,
        },
      });

      // Mettre à jour le nom d'affichage de l'utilisateur avec le nom du STAR
      if (memberName) {
        await tx.user.update({
          where: { id: linkRequest.userId },
          data: { displayName: `${memberName.firstName} ${memberName.lastName}` },
        });
      }

      // Mettre à jour la demande
      await tx.memberLinkRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          memberId: memberId!,
          reviewedAt: new Date(),
          reviewedById: session.user.id,
        },
      });
    });

    return successResponse({ approved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
