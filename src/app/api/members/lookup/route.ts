import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

/**
 * Recherche de STAR à l'échelle de l'église, sans filtre de périmètre.
 *
 * Complète `GET /api/members`, scopé aux départements de l'appelant : pour rattacher un STAR
 * existant à son département, un responsable doit d'abord pouvoir le trouver hors de son
 * périmètre. La réponse se limite donc à l'identité et aux départements d'appartenance.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const q = (searchParams.get("q") ?? "").trim();

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("members:manage", churchId);

    if (q.length < 2) return successResponse([]);

    const members = await prisma.member.findMany({
      where: {
        departments: { some: { department: { ministry: { churchId } } } },
        OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        departments: { select: { departmentId: true, department: { select: { name: true } } } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 20,
    });

    return successResponse(
      members.map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        departmentIds: m.departments.map((d) => d.departmentId),
        departmentNames: m.departments.map((d) => d.department.name),
      }))
    );
  } catch (error) {
    return errorResponse(error);
  }
}
