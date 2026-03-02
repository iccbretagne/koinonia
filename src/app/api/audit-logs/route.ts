import { prisma } from "@/lib/prisma";
import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("church:manage");
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const churchId = await getCurrentChurchId(session);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: churchId ? { churchId } : undefined,
        include: {
          user: { select: { id: true, name: true, displayName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({
        where: churchId ? { churchId } : undefined,
      }),
    ]);

    return successResponse({
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
