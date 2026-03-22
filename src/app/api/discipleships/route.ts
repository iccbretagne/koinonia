import { prisma } from "@/lib/prisma";
import { requireChurchPermission, getDiscipleshipScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { z } from "zod";

const createSchema = z.union([
  z.object({
    discipleId: z.string(),
    discipleMakerId: z.string(),
    churchId: z.string(),
    firstMakerId: z.string().optional(),
  }),
  z.object({
    newMember: z.object({
      firstName: z.string().min(1, "Le prénom est requis"),
      lastName: z.string().min(1, "Le nom est requis"),
    }),
    discipleMakerId: z.string(),
    churchId: z.string(),
    firstMakerId: z.string().optional(),
  }),
]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    const session = await requireChurchPermission("discipleship:view", churchId);

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
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const { discipleMakerId, churchId, firstMakerId } = parsed;
    const session = await requireChurchPermission("discipleship:manage", churchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    // DISCIPLE_MAKER ne peut créer que des relations dont il est le FD
    const scope = await getDiscipleshipScope(session, churchId);
    if (scope.scoped && discipleMakerId !== scope.memberId) {
      throw new ApiError(403, "Vous ne pouvez créer des relations que pour vous-même");
    }

    // Résoudre ou créer le disciple
    let discipleId: string;
    if ("newMember" in parsed) {
      const sysDept = await prisma.department.findFirst({
        where: { isSystem: true, ministry: { churchId } },
        select: { id: true },
      });
      if (!sysDept) throw new ApiError(500, "Département système introuvable pour cette église");

      const created = await prisma.member.create({
        data: { firstName: parsed.newMember.firstName, lastName: parsed.newMember.lastName, departmentId: sysDept.id },
      });
      discipleId = created.id;
    } else {
      discipleId = parsed.discipleId;
    }

    if (discipleId === discipleMakerId) {
      throw new ApiError(400, "Un STAR ne peut pas être son propre FD");
    }

    // Validate all member references belong to the specified church
    const memberIdsToCheck = [discipleId, discipleMakerId, ...(firstMakerId ? [firstMakerId] : [])];
    const validMembers = await prisma.member.findMany({
      where: { id: { in: memberIdsToCheck }, department: { ministry: { churchId } } },
      select: { id: true },
    });
    if (validMembers.length !== new Set(memberIdsToCheck).size) {
      throw new ApiError(400, "Un ou plusieurs membres n'appartiennent pas à cette église");
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

    await logAudit({ userId: session.user.id, churchId, action: "CREATE", entityType: "Discipleship", entityId: discipleship.id });

    return successResponse(discipleship, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
