import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("users:manage", churchId);

    const users = await prisma.user.findMany({
      where: { churchRoles: { some: { churchId } } },
      include: {
        churchRoles: {
          where: { churchId },
          include: {
            church: { select: { id: true, name: true } },
          },
        },
        _count: { select: { accounts: true } },
      },
      orderBy: { name: "asc" },
    });

    // Un User sans aucune ligne Account n'a jamais terminé de connexion Google — l'adaptateur
    // NextAuth ne la crée qu'au premier signIn réussi (spec 047).
    return successResponse(
      users.map(({ _count, ...u }) => ({ ...u, neverConnected: _count.accounts === 0 }))
    );
  } catch (error) {
    return errorResponse(error);
  }
}
