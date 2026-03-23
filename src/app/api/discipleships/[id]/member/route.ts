import { prisma } from "@/lib/prisma";
import { requireChurchPermission, getDiscipleshipScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const updateSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide").nullable().optional(),
  phone: z.string().nullable().optional(),
});

// PATCH /api/discipleships/[id]/member — mise à jour du profil du disciple
// Accessible au FD (discipleship:manage) pour ses propres disciples
// et aux admins (members:manage)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const discipleship = await prisma.discipleship.findUnique({
      where: { id },
      select: { discipleId: true, discipleMakerId: true, churchId: true },
    });
    if (!discipleship) throw new ApiError(404, "Relation de discipolat introuvable");

    const session = await requireChurchPermission("discipleship:manage", discipleship.churchId);

    // DISCIPLE_MAKER ne peut modifier que ses propres disciples
    const scope = await getDiscipleshipScope(session, discipleship.churchId);
    if (scope.scoped && discipleship.discipleMakerId !== scope.memberId) {
      throw new ApiError(403, "Vous ne pouvez modifier que vos propres disciples");
    }

    const data = updateSchema.parse(await request.json());

    const member = await prisma.member.update({
      where: { id: discipleship.discipleId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        departments: { where: { isPrimary: true }, select: { department: { select: { name: true, ministry: { select: { name: true } } } } } },
      },
    });

    return successResponse(member);
  } catch (error) {
    return errorResponse(error);
  }
}
