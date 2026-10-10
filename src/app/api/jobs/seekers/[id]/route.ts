import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { JOBS_AUTHOR_INCLUDE, jobsAccess, requireJobsAuthorOrModerator, patchDate } from "@/modules/jobs";
import { patchSeekerSchema } from "./contract";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const seeker = await prisma.jobSeeker.findUnique({
      where: { id },
      include: JOBS_AUTHOR_INCLUDE,
    });

    if (!seeker) throw new ApiError(404, "Profil introuvable");

    const { isAuthor, canManage } = await jobsAccess(session, seeker.authorId);

    if (seeker.status !== "ACTIVE" && !isAuthor && !canManage) {
      throw new ApiError(404, "Profil introuvable");
    }

    return successResponse(seeker);
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

    const seeker = await prisma.jobSeeker.findUnique({
      where: { id },
      select: { id: true, authorId: true, status: true },
    });

    if (!seeker) throw new ApiError(404, "Profil introuvable");

    const { isAuthor, canManage } = await requireJobsAuthorOrModerator(session, seeker.authorId);

    const data = patchSeekerSchema.parse(await request.json());

    // Seul un admin/secrétaire peut archiver
    if (data.status === "ARCHIVED" && !canManage) {
      throw new ApiError(403, "Seul un modérateur peut archiver un profil");
    }
    // Une publication archivée l'a été par la modération : seul un modérateur la remet en ligne
    // (spec 064), sans quoi l'auteur annulerait la décision.
    if (seeker.status === "ARCHIVED" && data.status !== undefined && data.status !== "ARCHIVED" && !canManage) {
      throw new ApiError(403, "Seul un modérateur peut remettre en ligne un profil retiré");
    }
    // Seul l'auteur peut passer à FOUND (ou admin)
    if (data.status === "FOUND" && !isAuthor && !canManage) {
      throw new ApiError(403, "Accès refusé");
    }

    const updated = await prisma.jobSeeker.update({
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

    const seeker = await prisma.jobSeeker.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });

    if (!seeker) throw new ApiError(404, "Profil introuvable");

    await requireJobsAuthorOrModerator(session, seeker.authorId);

    await prisma.jobSeeker.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
