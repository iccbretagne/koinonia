import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireIntegrationAccess } from "@/modules/integration";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireIntegrationAccess(churchId);

    const msdpMembers = await prisma.member.findMany({
      where: {
        departments: {
          some: {
            department: {
              function: "MSDP",
              ministry: { churchId },
            },
          },
        },
      },
      select: {
        userLinks: {
          where: { churchId, validatedAt: { not: null } },
          select: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    });

    const seenIds = new Set<string>();
    const counselors: { id: string; name: string | null; email: string | null; image: string | null }[] = [];
    for (const m of msdpMembers) {
      for (const link of m.userLinks) {
        if (!seenIds.has(link.user.id)) {
          seenIds.add(link.user.id);
          counselors.push(link.user);
        }
      }
    }
    counselors.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    return successResponse(counselors);
  } catch (error) {
    return errorResponse(error);
  }
}
