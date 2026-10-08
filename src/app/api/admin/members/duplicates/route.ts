import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { resolveMemberDepartmentScope } from "@/lib/member-scope";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { duplicateGroups } from "@/lib/member-duplicates";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");
    const session = await requireChurchPermission("members:manage", churchId);

    // Filtré au périmètre de l'appelant — sinon un Resp. département verrait les emails de
    // toute l'église (spec 054/#583, même défaut que la page /admin/members/duplicates).
    const scope = await resolveMemberDepartmentScope(session, churchId);
    const membersWhere = scope.scoped
      ? { departments: { some: { departmentId: { in: scope.departmentIds } } } }
      : { departments: { some: { department: { ministry: { churchId } } } } };

    const members = await prisma.member.findMany({
      where: membersWhere,
      include: {
        departments: {
          include: {
            department: { select: { id: true, name: true, ministry: { select: { id: true, name: true } } } },
          },
          orderBy: { isPrimary: "desc" },
        },
        userLinks: { where: { churchId }, select: { userId: true, user: { select: { name: true, email: true } } } },
        _count: { select: { plannings: true, discipleships: true, disciplesMade: true } },
      },
    });

    return successResponse(duplicateGroups(members));
  } catch (error) {
    return errorResponse(error);
  }
}
