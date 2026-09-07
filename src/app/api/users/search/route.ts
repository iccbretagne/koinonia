import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

// Recherche d'utilisateurs non liés à un STAR dans une église donnée.
//
// Par nom/prénom : uniquement parmi les utilisateurs déjà rattachés à CETTE église
// (rôle ou demande de liaison) — pas de recherche floue cross-tenant par nom.
//
// Par email : correspondance EXACTE, sur toute la plateforme (spec 037). Un compte déjà lié à
// un STAR dans une autre église n'a par définition aucun rattachement ici (ni rôle, ni demande)
// et resterait introuvable sinon — cas réel : un STAR sert dans deux églises. Une correspondance
// exacte ne permet pas d'énumérer des comptes : il faut déjà connaître l'adresse complète, comme
// pour un "inviter par email" classique.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("members:manage", churchId);
    if (q.length < 2) return successResponse([]);

    const memberLinksSelect = { where: { churchId }, select: { id: true } } as const;
    const userSelect = { id: true, name: true, displayName: true, image: true, memberLinks: memberLinksSelect };

    const [nameMatches, emailMatch] = await Promise.all([
      prisma.user.findMany({
        where: {
          AND: [
            {
              OR: [
                { name: { contains: q } },
                { displayName: { contains: q } },
              ],
            },
            {
              OR: [
                { churchRoles: { some: { churchId } } },
                { memberLinkRequests: { some: { churchId, status: { in: ["PENDING", "APPROVED"] } } } },
              ],
            },
          ],
        },
        select: userSelect,
        take: 20,
        orderBy: { name: "asc" },
      }),
      q.includes("@")
        ? prisma.user.findFirst({ where: { email: q }, select: userSelect })
        : Promise.resolve(null),
    ]);

    const matches = emailMatch
      ? [emailMatch, ...nameMatches.filter((u) => u.id !== emailMatch.id)]
      : nameMatches;

    // Filtrer les utilisateurs déjà liés dans cette église côté applicatif
    const users = matches
      .filter((u) => u.memberLinks.length === 0)
      .slice(0, 10)
      .map(({ memberLinks: _, ...u }) => u);

    return successResponse(users);
  } catch (error) {
    return errorResponse(error);
  }
}
