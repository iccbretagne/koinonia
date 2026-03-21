import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  departmentId: z.string().min(1, "Le département est requis"),
  email: z.string().email("Email invalide").nullable().optional(),
  phone: z.string().nullable().optional(),
});

function getChurchDeptScope(session: { user: { isSuperAdmin: boolean; churchRoles: { churchId: string; role: string; departments: { department: { id: string } }[] }[] } }, churchId: string) {
  const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];
  const hasGlobalRole = session.user.isSuperAdmin || churchRoles.some((r) => GLOBAL_ROLES.includes(r.role));
  return hasGlobalRole
    ? null
    : Array.from(new Set(churchRoles.flatMap((r) => r.departments.map((d) => d.department.id))));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;
    const churchId = await resolveChurchId("member", memberId);
    const session = await requireChurchPermission("members:manage", churchId);
    const scopedDeptIds = getChurchDeptScope(session, churchId);
    const body = await request.json();
    const data = updateSchema.parse(body);

    if (scopedDeptIds) {
      const existing = await prisma.member.findUnique({
        where: { id: memberId },
        select: { departmentId: true },
      });

      if (!existing) {
        throw new ApiError(404, "STAR introuvable");
      }

      if (!scopedDeptIds.includes(existing.departmentId)) {
        throw new ApiError(403, "Ce STAR est hors de votre périmètre");
      }

      if (!scopedDeptIds.includes(data.departmentId)) {
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

    await logAudit({ userId: session.user.id, churchId, action: "UPDATE", entityType: "Member", entityId: memberId, details: { firstName: data.firstName, lastName: data.lastName } });

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
    const { memberId } = await params;
    const churchId = await resolveChurchId("member", memberId);
    const session = await requireChurchPermission("members:manage", churchId);
    const scopedDeptIds = getChurchDeptScope(session, churchId);

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, departmentId: true },
    });

    if (!member) {
      throw new ApiError(404, "STAR introuvable");
    }

    if (scopedDeptIds && !scopedDeptIds.includes(member.departmentId)) {
      throw new ApiError(403, "Ce STAR est hors de votre périmètre");
    }

    await prisma.member.delete({ where: { id: memberId } });

    await logAudit({ userId: session.user.id, churchId, action: "DELETE", entityType: "Member", entityId: memberId });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
