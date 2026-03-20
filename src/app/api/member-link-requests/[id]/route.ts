import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const approveSchema = z.object({
  action: z.enum(["approve", "reject"]),
  role: z.enum(["ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"]).optional(),
  rejectReason: z.string().optional(),
  departmentId: z.string().optional(), // requis si création d'un nouveau STAR
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("members:manage");
    const { id } = await params;
    const body = await request.json();
    const { action, role, rejectReason, departmentId } = approveSchema.parse(body);

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
    if (!role) throw new ApiError(400, "Le rôle est requis pour approuver");

    await prisma.$transaction(async (tx) => {
      let memberId = linkRequest.memberId;

      // Créer le Member si nouvelle demande
      if (!memberId) {
        if (!departmentId) throw new ApiError(400, "Le département est requis pour créer un STAR");
        const newMember = await tx.member.create({
          data: {
            firstName: linkRequest.firstName!,
            lastName: linkRequest.lastName!,
            phone: linkRequest.phone ?? undefined,
            departmentId,
          },
        });
        memberId = newMember.id;
      }

      // Créer le lien MemberUserLink
      await tx.memberUserLink.create({
        data: {
          memberId,
          userId: linkRequest.userId,
          churchId: linkRequest.churchId,
          validatedAt: new Date(),
          validatedById: session.user.id,
        },
      });

      // Attribuer le rôle
      await tx.userChurchRole.upsert({
        where: {
          userId_churchId_role: {
            userId: linkRequest.userId,
            churchId: linkRequest.churchId,
            role,
          },
        },
        update: {},
        create: {
          userId: linkRequest.userId,
          churchId: linkRequest.churchId,
          role,
        },
      });

      // Mettre à jour la demande
      await tx.memberLinkRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          memberId,
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
