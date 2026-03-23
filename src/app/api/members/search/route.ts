import { prisma } from "@/lib/prisma";
import { requireChurchAccess } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

// Recherche de STAR sans rôle requis — utilisé depuis /no-access pour l'autocomplete
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchAccess(churchId);
    if (q.length < 2) return successResponse([]);

    const matches = await prisma.member.findMany({
      where: {
        departments: { some: { department: { ministry: { churchId } } } },
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, userLink: { select: { id: true } } },
      take: 20,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const members = matches
      .filter((m) => !m.userLink)
      .slice(0, 10)
      .map(({ userLink: _, ...m }) => m);

    return successResponse(members);
  } catch (error) {
    return errorResponse(error);
  }
}
