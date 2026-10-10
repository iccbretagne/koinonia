import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { JOBS_AUTHOR_INCLUDE, jobsAccess, requireJobsAuthorOrModerator, patchDate } from "@/modules/jobs";
import { patchProfileSchema } from "./contract";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const profile = await prisma.freelanceProfile.findUnique({
      where: { id },
      include: JOBS_AUTHOR_INCLUDE,
    });

    if (!profile) throw new ApiError(404, "Profil freelance introuvable");

    const { isAuthor, canManage } = jobsAccess(session, profile.authorId);

    if (profile.status !== "ACTIVE" && !isAuthor && !canManage) {
      throw new ApiError(404, "Profil freelance introuvable");
    }

    return successResponse(profile);
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

    const profile = await prisma.freelanceProfile.findUnique({
      where: { id },
      select: { id: true, authorId: true, status: true },
    });

    if (!profile) throw new ApiError(404, "Profil freelance introuvable");

    const { canManage } = requireJobsAuthorOrModerator(session, profile.authorId);

    const data = patchProfileSchema.parse(await request.json());

    if (data.status === "ARCHIVED" && !canManage) {
      throw new ApiError(403, "Seul un modérateur peut archiver un profil freelance");
    }
    // Une publication archivée l'a été par la modération : seul un modérateur la remet en ligne
    // (spec 064), sans quoi l'auteur annulerait la décision.
    if (profile.status === "ARCHIVED" && data.status !== undefined && data.status !== "ARCHIVED" && !canManage) {
      throw new ApiError(403, "Seul un modérateur peut remettre en ligne un profil freelance retiré");
    }

    const updated = await prisma.freelanceProfile.update({
      where: { id },
      data: {
        ...data,
        ...patchDate("availableFrom", data.availableFrom),
      },
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

    const profile = await prisma.freelanceProfile.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });

    if (!profile) throw new ApiError(404, "Profil freelance introuvable");

    requireJobsAuthorOrModerator(session, profile.authorId);

    await prisma.freelanceProfile.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
