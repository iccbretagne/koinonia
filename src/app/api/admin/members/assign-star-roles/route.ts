import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { resolveMemberDepartmentScope, isMemberInScope } from "@/lib/member-scope";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { schema } from "./contract";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { churchId } = schema.parse(body);
    // access:manage — remplace members:manage, qui laissait tout Resp. département attribuer
    // le rôle STAR à toute l'église en un geste (spec 054/#583, défaut B2 de audit-rbac.md)
    const session = await requireChurchPermission("access:manage", churchId);
    const memberScope = await resolveMemberDepartmentScope(session, churchId);

    // Tous les MemberUserLink de cette église, filtrés au périmètre de l'appelant
    const links = await prisma.memberUserLink.findMany({
      where: { churchId },
      select: { userId: true, member: { select: { departments: { select: { departmentId: true } } } } },
    });
    const scopedLinks = links.filter((l) =>
      isMemberInScope(memberScope, l.member.departments.map((d) => d.departmentId))
    );

    const withRole = new Set(
      (
        await prisma.userChurchRole.findMany({
          where: { churchId, userId: { in: scopedLinks.map((l) => l.userId) } },
          select: { userId: true },
        })
      ).map((r) => r.userId)
    );
    const toAssign = [...new Set(scopedLinks.map((l) => l.userId))].filter((userId) => !withRole.has(userId));
    if (toAssign.length > 0) {
      await prisma.userChurchRole.createMany({
        data: toAssign.map((userId) => ({ userId, churchId, role: "STAR" as const })),
      });
    }
    const assigned = toAssign.length;

    return successResponse({ assigned, total: scopedLinks.length });
  } catch (error) {
    return errorResponse(error);
  }
}
