import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

// Recherche d'utilisateurs non liés à un STAR dans une église donnée
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("members:manage", churchId);
    if (q.length < 2) return successResponse([]);

    const matches = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { email: { contains: q } },
          { displayName: { contains: q } },
        ],
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        image: true,
        memberLinks: { where: { churchId }, select: { id: true } },
      },
      take: 20,
      orderBy: { name: "asc" },
    });

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
