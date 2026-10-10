import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";
import { JOBS_AUTHOR_INCLUDE, jobsAccess, requireJobsAuthorOrModerator } from "@/modules/jobs";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const mission = await prisma.freelanceMission.findUnique({
      where: { id },
      include: JOBS_AUTHOR_INCLUDE,
    });

    if (!mission) throw new ApiError(404, "Mission introuvable");

    const { isAuthor, canManage } = jobsAccess(session, mission.authorId);

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

    const { canManage } = requireJobsAuthorOrModerator(session, mission.authorId);

    const data = patchMissionSchema.parse(await request.json());

    if (data.status === "ARCHIVED" && !canManage) {
      throw new ApiError(403, "Seul un modérateur peut archiver une mission");
    }
    // Une publication archivée l'a été par la modération : seul un modérateur la remet en ligne
    // (spec 064), sans quoi l'auteur annulerait la décision.
    if (mission.status === "ARCHIVED" && data.status !== undefined && data.status !== "ARCHIVED" && !canManage) {
      throw new ApiError(403, "Seul un modérateur peut remettre en ligne une mission retirée");
    }

    const updated = await prisma.freelanceMission.update({
      where: { id },
      data,
      include: JOBS_AUTHOR_INCLUDE,
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

    requireJobsAuthorOrModerator(session, mission.authorId);

    await prisma.freelanceMission.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
