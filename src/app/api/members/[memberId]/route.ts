import { prisma } from "@/lib/prisma";
import { requirePermission, getUserDepartmentScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const updateSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  departmentId: z.string().min(1, "Le département est requis"),
  email: z.string().email("Email invalide").nullable().optional(),
  phone: z.string().nullable().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const session = await requirePermission("members:manage");
    const scope = getUserDepartmentScope(session);
    const { memberId } = await params;
    const body = await request.json();
    const data = updateSchema.parse(body);

    if (scope.scoped) {
      const existing = await prisma.member.findUnique({
        where: { id: memberId },
        select: { departmentId: true },
      });

      if (!existing) {
        throw new ApiError(404, "STAR introuvable");
      }

      if (!scope.departmentIds.includes(existing.departmentId)) {
        throw new ApiError(403, "Ce STAR est hors de votre périmètre");
      }

      if (!scope.departmentIds.includes(data.departmentId)) {
        throw new ApiError(403, "Département cible non autorisé");
      }
    }

    const member = await prisma.member.update({
      where: { id: memberId },
      data,
      include: {
        department: {
          select: {
            id: true,
            name: true,
            ministry: { select: { id: true, name: true } },
          },
        },
      },
    });

    return successResponse(member);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const session = await requirePermission("members:manage");
    const scope = getUserDepartmentScope(session);
    const { memberId } = await params;

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, departmentId: true },
    });

    if (!member) {
      throw new ApiError(404, "STAR introuvable");
    }

    if (scope.scoped && !scope.departmentIds.includes(member.departmentId)) {
      throw new ApiError(403, "Ce STAR est hors de votre périmètre");
    }

    await prisma.member.delete({ where: { id: memberId } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
