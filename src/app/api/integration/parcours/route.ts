import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { isIntegrationMember, isMsdpMember } from "@/modules/integration";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  churchId: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  sourceRequestId: z.string().optional(),
  notes: z.string().max(10000).optional(),
});

async function canAccess(churchId: string): Promise<boolean> {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return true;
  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length > 0) {
    const { rolePermissions } = await import("@/lib/registry");
    const perms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
    if (perms.has("members:manage") || perms.has("events:manage")) return true;
  }
  if (await isIntegrationMember(session, churchId)) return true;
  return isMsdpMember(session, churchId);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    const session = await requireAuth();
    const hasAccess =
      session.user.isSuperAdmin ||
      (await (async () => {
        const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
        if (roles.length > 0) {
          const { rolePermissions } = await import("@/lib/registry");
          const perms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
          if (perms.has("members:manage") || perms.has("events:manage")) return true;
        }
        if (await isIntegrationMember(session, churchId)) return true;
        return isMsdpMember(session, churchId);
      })());
    if (!hasAccess) throw new ApiError(403, "Accès refusé");

    const milestone = searchParams.get("milestone"); // FAMILY | PCNC | STAR | DISCIPLESHIP
    const search = searchParams.get("search") ?? "";

    const where: Record<string, unknown> = { churchId };
    if (milestone === "FAMILY") where.integratedInFamily = false;
    if (milestone === "PCNC") where.followsPcnc = false;
    if (milestone === "STAR") where.isStar = false;
    if (milestone === "DISCIPLESHIP") where.inDiscipleship = false;
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const journeys = await prisma.personJourney.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        sourceRequest: { select: { id: true, status: true, assignedFamilyName: true } },
      },
    });

    return successResponse(journeys);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const session = await requireAuth();

    const hasAccess = await canAccess(body.churchId);
    if (!hasAccess) throw new ApiError(403, "Accès refusé");

    // Déduplication par téléphone (blocage dur)
    if (body.phone) {
      const existing = await prisma.personJourney.findFirst({
        where: { churchId: body.churchId, phone: body.phone },
        select: { id: true, firstName: true, lastName: true },
      });
      if (existing) {
        throw new ApiError(
          409,
          `Un dossier existe déjà pour ce numéro (${existing.firstName} ${existing.lastName})`
        );
      }
    }

    // Déduplication par email (blocage dur)
    if (body.email) {
      const existing = await prisma.personJourney.findFirst({
        where: { churchId: body.churchId, email: body.email },
        select: { id: true, firstName: true, lastName: true },
      });
      if (existing) {
        throw new ApiError(
          409,
          `Un dossier existe déjà pour cet email (${existing.firstName} ${existing.lastName})`
        );
      }
    }

    // Vérifier que la demande source appartient bien à cette église
    if (body.sourceRequestId) {
      const req = await prisma.familyIntegrationRequest.findUnique({
        where: { id: body.sourceRequestId },
        select: { churchId: true, personJourney: { select: { id: true } } },
      });
      if (!req || req.churchId !== body.churchId)
        throw new ApiError(404, "Demande source introuvable");
      if (req.personJourney)
        throw new ApiError(409, "Un dossier parcours existe déjà pour cette demande");
    }

    const journey = await prisma.personJourney.create({
      data: {
        churchId: body.churchId,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone ?? null,
        email: body.email || null,
        sourceRequestId: body.sourceRequestId ?? null,
        notes: body.notes ?? null,
        createdById: session.user.id,
      },
      include: {
        sourceRequest: { select: { id: true, status: true, assignedFamilyName: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: body.churchId,
      action: "CREATE",
      entityType: "PersonJourney",
      entityId: journey.id,
      details: { firstName: body.firstName, lastName: body.lastName },
    });

    return successResponse(journey, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
