import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";
import { JOBS_AUTHOR_INCLUDE, jobsAccess, requireJobsAuthorOrModerator, patchDate } from "@/modules/jobs";

const patchSeekerSchema = z
  .object({
    title:          z.string().min(1).max(200).optional(),
    wantEmploi:     z.boolean().optional(),
    wantStage:      z.boolean().optional(),
    wantAlternance: z.boolean().optional(),
    sector:         z.string().max(150).nullable().optional(),
    location:       z.string().max(150).nullable().optional(),
    remote:         z.boolean().optional(),
    availableFrom:  z.string().datetime().nullable().optional(),
    description:    z.string().min(1).optional(),
    contactEmail:   z.string().email().max(150).nullable().optional(),
    contactUrl:     z.string().url().max(500).nullable().optional(),
    status:         z.enum(["ACTIVE", "FOUND", "ARCHIVED"]).optional(),
  });

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

    const { isAuthor, canManage } = jobsAccess(session, seeker.authorId);

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

    const { isAuthor, canManage } = requireJobsAuthorOrModerator(session, seeker.authorId);

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

    requireJobsAuthorOrModerator(session, seeker.authorId);

    await prisma.jobSeeker.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
