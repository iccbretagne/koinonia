import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireIntegrationAccess } from "@/modules/integration";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireIntegrationAccess(churchId);

    const familyId = searchParams.get("familyId");

    const leaders = await prisma.familyLeaderAssignment.findMany({
      where: {
        churchId,
        ...(familyId && { familyId: parseInt(familyId) }),
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: [{ familyId: "asc" }, { role: "asc" }],
    });

    return successResponse(leaders);
  } catch (error) {
    return errorResponse(error);
  }
}

const createSchema = z.object({
  churchId: z.string().min(1),
  userId: z.string().min(1),
  familyId: z.number().int().positive(),
  familyName: z.string().min(1).max(100),
  role: z.enum(["BERGER", "CO_BERGER"]),
});

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const { session } = await requireIntegrationAccess(body.churchId);

    // Vérifier que l'utilisateur appartient à cette église
    const user = await prisma.user.findFirst({
      where: { id: body.userId, churchRoles: { some: { churchId: body.churchId } } },
      select: { id: true, name: true },
    });
    if (!user) throw new ApiError(400, "Utilisateur introuvable dans cette église");

    const assignment = await prisma.familyLeaderAssignment.create({
      data: {
        churchId: body.churchId,
        userId: body.userId,
        familyId: body.familyId,
        familyName: body.familyName,
        role: body.role,
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: body.churchId,
      action: "CREATE",
      entityType: "FamilyLeaderAssignment",
      entityId: assignment.id,
      details: { familyId: body.familyId, familyName: body.familyName, role: body.role },
    });

    return successResponse(assignment, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
