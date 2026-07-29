import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

// Recherche d'utilisateurs de l'église pour l'autocomplétion de la main courante
// (remise/réception des clés) — accessible à quiconque peut consulter les salles.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("rooms:view", churchId);
    if (q.length < 2) return successResponse([]);

    const users = await prisma.user.findMany({
      where: {
        churchRoles: { some: { churchId } },
        OR: [{ name: { contains: q } }, { displayName: { contains: q } }],
      },
      select: { id: true, name: true, displayName: true },
      take: 10,
      orderBy: { name: "asc" },
    });

    return successResponse(users);
  } catch (error) {
    return errorResponse(error);
  }
}
