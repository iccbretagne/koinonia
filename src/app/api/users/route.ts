import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("members:manage", churchId);

    const users = await prisma.user.findMany({
      where: { churchRoles: { some: { churchId } } },
      include: {
        churchRoles: {
          where: { churchId },
          include: {
            church: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return successResponse(users);
  } catch (error) {
    return errorResponse(error);
  }
}
