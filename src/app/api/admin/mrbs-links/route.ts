import { prisma } from "@/lib/prisma";
import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const createSchema = z.object({
  mrbsUsername: z.string().min(1),
  userId: z.string().min(1),
});

export async function GET(_request: Request) {
  try {
    const session = await requirePermission("mrbs:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const links = await prisma.mrbsUserLink.findMany({
      where: { churchId },
      include: {
        user: { select: { id: true, email: true, name: true, displayName: true } },
        linkedBy: { select: { id: true, name: true, displayName: true } },
      },
      orderBy: { linkedAt: "desc" },
    });

    return successResponse(links);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("mrbs:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const data = createSchema.parse(await request.json());

    const link = await prisma.mrbsUserLink.upsert({
      where: { mrbsUsername: data.mrbsUsername },
      create: {
        mrbsUsername: data.mrbsUsername,
        userId: data.userId,
        churchId,
        linkedById: session.user.id!,
      },
      update: {
        userId: data.userId,
        linkedById: session.user.id!,
        linkedAt: new Date(),
      },
    });

    return successResponse(link, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requirePermission("mrbs:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const mrbsUsername = new URL(request.url).searchParams.get("mrbsUsername");
    if (!mrbsUsername) throw new ApiError(400, "Paramètre mrbsUsername requis");

    await prisma.mrbsUserLink.deleteMany({
      where: { mrbsUsername, churchId },
    });

    return successResponse({ deleted: mrbsUsername });
  } catch (error) {
    return errorResponse(error);
  }
}
