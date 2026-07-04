import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const patchMissionSchema = z.object({
  title:        z.string().min(1).max(200).optional(),
  domain:       z.string().min(1).max(150).optional(),
  duration:     z.string().max(100).nullable().optional(),
  dailyRate:    z.string().max(100).nullable().optional(),
  hourlyRate:   z.string().max(100).nullable().optional(),
  modality:     z.enum(["REMOTE", "ONSITE", "HYBRID"]).optional(),
  location:     z.string().max(150).nullable().optional(),
  description:  z.string().min(1).optional(),
  contactEmail: z.string().email().max(150).nullable().optional(),
  contactUrl:   z.string().url().max(500).nullable().optional(),
  status:       z.enum(["ACTIVE", "FILLED", "ARCHIVED"]).optional(),
});

function canManageJobs(session: { user: { isSuperAdmin: boolean; churchRoles?: { role: string }[] } }) {
  return (
    session.user.isSuperAdmin ||
    session.user.churchRoles?.some((r) =>
      ["SUPER_ADMIN", "ADMIN", "SECRETARY"].includes(r.role)
    )
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const mission = await prisma.freelanceMission.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
    });

    if (!mission) throw new ApiError(404, "Mission introuvable");

    const isAuthor  = mission.authorId === session.user.id;
    const canManage = canManageJobs(session);

    if (mission.status !== "ACTIVE" && !isAuthor && !canManage) {
      throw new ApiError(404, "Mission introuvable");
    }

    return successResponse(mission);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const mission = await prisma.freelanceMission.findUnique({
      where: { id },
      select: { id: true, authorId: true, status: true },
    });

    if (!mission) throw new ApiError(404, "Mission introuvable");

    const isAuthor  = mission.authorId === session.user.id;
    const canManage = canManageJobs(session);

    if (!isAuthor && !canManage) throw new ApiError(403, "Accès refusé");

    const data = patchMissionSchema.parse(await request.json());

    if (data.status === "ARCHIVED" && !canManage) {
      throw new ApiError(403, "Seul un modérateur peut archiver une mission");
    }

    const updated = await prisma.freelanceMission.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
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
    const session = await requireAuth();
    const { id } = await params;

    const mission = await prisma.freelanceMission.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });

    if (!mission) throw new ApiError(404, "Mission introuvable");

    const isAuthor  = mission.authorId === session.user.id;
    const canManage = canManageJobs(session);

    if (!isAuthor && !canManage) throw new ApiError(403, "Accès refusé");

    await prisma.freelanceMission.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
