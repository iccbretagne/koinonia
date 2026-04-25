import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { z } from "zod";

const schema = z.object({ churchId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { churchId } = schema.parse(body);
    await requireChurchPermission("members:manage", churchId);

    // Tous les MemberUserLink de cette église
    const links = await prisma.memberUserLink.findMany({
      where: { churchId },
      select: { userId: true },
    });

    let assigned = 0;
    for (const { userId } of links) {
      const hasRole = await prisma.userChurchRole.findFirst({
        where: { userId, churchId },
      });
      if (!hasRole) {
        await prisma.userChurchRole.create({
          data: { userId, churchId, role: "STAR" },
        });
        assigned++;
      }
    }

    return successResponse({ assigned, total: links.length });
  } catch (error) {
    return errorResponse(error);
  }
}
