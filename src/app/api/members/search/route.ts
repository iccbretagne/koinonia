import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { rankMembersByName } from "@/lib/onboarding";

// Recherche de STAR sans rôle requis — utilisé depuis /no-access pour l'autocomplete.
// IMPORTANT : un nouvel arrivant en onboarding n'a AUCUN accès à l'église (il est
// justement sur /no-access), donc `requireAuth()` et non `requireChurchAccess()` —
// sinon la recherche renvoie 403 pour exactement ceux qui en ont besoin. L'endpoint
// ne renvoie que des noms + département (ni email ni téléphone), même niveau d'accès
// que /api/onboarding/candidates.
// Matching flou (tokens + tolérance aux fautes) scoré côté application : on récupère
// les fiches non liées de l'église puis on les classe par pertinence via
// rankMembersByName (MariaDB n'offre pas de recherche trigramme).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireAuth();
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
