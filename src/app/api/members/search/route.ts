import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

// Recherche de STAR sans rôle requis — utilisé depuis /no-access pour l'autocomplete
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) throw new ApiError(401, "Non authentifié");

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    if (q.length < 2) return successResponse([]);

    const members = await prisma.member.findMany({
      where: {
        department: { ministry: { churchId } },
        userLink: null, // uniquement les STAR sans compte lié
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
        ],
      },
      select: { id: true, firstName: true, lastName: true },
      take: 10,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return successResponse(members);
  } catch (error) {
    return errorResponse(error);
  }
}
