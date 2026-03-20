import { prisma } from "@/lib/prisma";
import { requirePermission, getDiscipleshipScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const createSchema = z.object({
  discipleId: z.string(),
  discipleMakerId: z.string(),
  churchId: z.string(),
  firstMakerId: z.string().optional(), // si omis, = discipleMakerId
});

export async function GET(request: Request) {
  try {
    const session = await requirePermission("discipleship:view");

    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    const scope = await getDiscipleshipScope(session, churchId);
    const whereScope = scope.scoped
      ? { discipleMakerId: scope.memberId ?? "" }
      : {};

    const discipleships = await prisma.discipleship.findMany({
      where: { churchId, ...whereScope },
      include: {
        disciple: { select: { id: true, firstName: true, lastName: true, department: { select: { name: true, ministry: { select: { name: true } } } } } },
        discipleMaker: { select: { id: true, firstName: true, lastName: true } },
        firstMaker: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ discipleMaker: { lastName: "asc" } }, { disciple: { lastName: "asc" } }],
    });

    return successResponse(discipleships);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("discipleship:manage");
    const body = await request.json();
    const { discipleId, discipleMakerId, churchId, firstMakerId } = createSchema.parse(body);

    if (discipleId === discipleMakerId) {
      throw new ApiError(400, "Un STAR ne peut pas être son propre FD");
    }

    // DISCIPLE_MAKER ne peut créer que des relations dont il est le FD
    const scope = await getDiscipleshipScope(session, churchId);
    if (scope.scoped && discipleMakerId !== scope.memberId) {
      throw new ApiError(403, "Vous ne pouvez créer des relations que pour vous-même");
    }

    // Vérifier qu'il n'y a pas déjà un lien de discipolat dans cette église
    const existing = await prisma.discipleship.findUnique({
      where: { discipleId_churchId: { discipleId, churchId } },
    });
    if (existing) throw new ApiError(409, "Ce STAR a déjà un FD dans cette église");

    const discipleship = await prisma.discipleship.create({
      data: {
        discipleId,
        discipleMakerId,
        firstMakerId: firstMakerId ?? discipleMakerId,
        churchId,
      },
      include: {
        disciple: { select: { id: true, firstName: true, lastName: true } },
        discipleMaker: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE_DISCIPLESHIP",
        entityType: "Discipleship",
        entityId: discipleship.id,
        churchId,
      },
    });

    return successResponse(discipleship, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
