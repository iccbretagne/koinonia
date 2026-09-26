import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { resolveMemberDepartmentScope, isMemberInScope } from "@/lib/member-scope";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { z } from "zod";

const schema = z.object({ churchId: z.string().min(1) });

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

    let assigned = 0;
    for (const { userId } of scopedLinks) {
      const hasRole = await prisma.userChurchRole.findFirst({
        where: { userId, churchId },
      });
      if (!hasRole) {
        await prisma.userChurchRole.create({
          data: { userId, churchId, role: "STAR" },
        });
        assigned++;
      }
    }

    return successResponse({ assigned, total: scopedLinks.length });
  } catch (error) {
    return errorResponse(error);
  }
}
