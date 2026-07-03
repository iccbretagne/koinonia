import { prisma } from "@/lib/prisma";
import { requireChurchAccess } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { rankMembersByName } from "@/lib/onboarding";

// Recherche de STAR sans rôle requis — utilisé depuis /no-access pour l'autocomplete.
// Matching flou (tokens + tolérance aux fautes) scoré côté application : on récupère
// les fiches non liées de l'église puis on les classe par pertinence via
// rankMembersByName (MariaDB n'offre pas de recherche trigramme).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchAccess(churchId);
    if (q.length < 2) return successResponse([]);

    const candidates = await prisma.member.findMany({
      where: {
        departments: { some: { department: { ministry: { churchId } } } },
        userLinks: { none: { churchId } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        departments: {
          where: { isPrimary: true },
          select: {
            department: {
              select: { name: true, ministry: { select: { name: true } } },
            },
          },
        },
      },
      take: 500,
    });

    const members = rankMembersByName(q, candidates, { limit: 10 }).map(
      ({ _score: _, ...m }) => m
    );

    return successResponse(members);
  } catch (error) {
    return errorResponse(error);
  }
}
