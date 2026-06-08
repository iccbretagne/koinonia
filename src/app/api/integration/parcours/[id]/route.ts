import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { isIntegrationMember, isMsdpMember } from "@/modules/integration";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import type { Session } from "next-auth";

async function hasAccess(session: Session, churchId: string): Promise<boolean> {
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

const patchSchema = z.object({
  integratedInFamily: z.boolean().optional(),
  familyIntegratedAt: z.string().datetime().optional().nullable(),
  followsPcnc: z.boolean().optional(),
  pcncStartedAt: z.string().datetime().optional().nullable(),
  isStar: z.boolean().optional(),
  starSince: z.string().datetime().optional().nullable(),
  inDiscipleship: z.boolean().optional(),
  discipleshipSince: z.string().datetime().optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const journey = await prisma.personJourney.findUnique({
      where: { id },
      include: {
        sourceRequest: {
          select: {
            id: true,
            status: true,
            assignedFamilyName: true,
            msdpFollowUp: { select: { id: true, status: true } },
          },
        },
      },
    });
    if (!journey) throw new ApiError(404, "Dossier introuvable");

    const session = await requireAuth();
    if (!(await hasAccess(session, journey.churchId))) throw new ApiError(403, "Accès refusé");

    return successResponse(journey);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const journey = await prisma.personJourney.findUnique({
      where: { id },
      select: { id: true, churchId: true },
    });
    if (!journey) throw new ApiError(404, "Dossier introuvable");

    const session = await requireAuth();
    if (!(await hasAccess(session, journey.churchId))) throw new ApiError(403, "Accès refusé");

    const body = patchSchema.parse(await request.json());
    const now = new Date();

    const data: Record<string, unknown> = {};

    if (body.integratedInFamily !== undefined) {
      data.integratedInFamily = body.integratedInFamily;
      if (body.integratedInFamily && body.familyIntegratedAt === undefined)
        data.familyIntegratedAt = now;
    }
    if (body.familyIntegratedAt !== undefined)
      data.familyIntegratedAt = body.familyIntegratedAt ? new Date(body.familyIntegratedAt) : null;

    if (body.followsPcnc !== undefined) {
      data.followsPcnc = body.followsPcnc;
      if (body.followsPcnc && body.pcncStartedAt === undefined) data.pcncStartedAt = now;
    }
    if (body.pcncStartedAt !== undefined)
      data.pcncStartedAt = body.pcncStartedAt ? new Date(body.pcncStartedAt) : null;

    if (body.isStar !== undefined) {
      data.isStar = body.isStar;
      if (body.isStar && body.starSince === undefined) data.starSince = now;
    }
    if (body.starSince !== undefined)
      data.starSince = body.starSince ? new Date(body.starSince) : null;

    if (body.inDiscipleship !== undefined) {
      data.inDiscipleship = body.inDiscipleship;
      if (body.inDiscipleship && body.discipleshipSince === undefined) data.discipleshipSince = now;
    }
    if (body.discipleshipSince !== undefined)
      data.discipleshipSince = body.discipleshipSince ? new Date(body.discipleshipSince) : null;

    if (body.notes !== undefined) data.notes = body.notes;

    const updated = await prisma.personJourney.update({
      where: { id },
      data,
      include: {
        sourceRequest: { select: { id: true, status: true, assignedFamilyName: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: journey.churchId,
      action: "UPDATE",
      entityType: "PersonJourney",
      entityId: id,
      details: body,
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const journey = await prisma.personJourney.findUnique({
      where: { id },
      select: { id: true, churchId: true },
    });
    if (!journey) throw new ApiError(404, "Dossier introuvable");

    const session = await requireAuth();
    if (!(await hasAccess(session, journey.churchId))) throw new ApiError(403, "Accès refusé");

    await prisma.personJourney.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      churchId: journey.churchId,
      action: "DELETE",
      entityType: "PersonJourney",
      entityId: id,
    });

    return successResponse({ id });
  } catch (error) {
    return errorResponse(error);
  }
}
