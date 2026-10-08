import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";
import { JOBS_AUTHOR_INCLUDE, requireJobsAuthorOrModerator, patchDate } from "@/modules/jobs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const job = await prisma.jobOffer.findUnique({
      where: { id },
      include: JOBS_AUTHOR_INCLUDE,
    });

    if (!job) throw new ApiError(404, "Offre introuvable");

    return successResponse(job);
  } catch (error) {
    return errorResponse(error);
  }
}

const patchSchema = z.object({
  title:        z.string().min(1).max(200).optional(),
  type:         z.enum(["EMPLOI", "STAGE", "ALTERNANCE"]).optional(),
  company:      z.string().min(1).max(150).optional(),
  location:     z.string().max(150).nullable().optional(),
  description:  z.string().min(1).optional(),
  duration:     z.string().max(100).nullable().optional(),
  deadline:     z.string().datetime().nullable().optional(),
  contactEmail: z.string().email().max(150).nullable().optional(),
  contactUrl:   z.string().url().max(500).nullable().optional(),
  status:       z.enum(["PUBLISHED", "ARCHIVED"]).optional(),
  // Marqueur de requête « Toujours d'actualité » (spec 034), pas une colonne :
  // retiré du payload avant le update Prisma.
  renew:        z.literal(true).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const job = await prisma.jobOffer.findUnique({ where: { id }, select: { id: true, authorId: true } });
    if (!job) throw new ApiError(404, "Offre introuvable");

    requireJobsAuthorOrModerator(session, job.authorId);

    const body = await request.json();
    const { renew: _renew, ...data } = patchSchema.parse(body);

    const updated = await prisma.jobOffer.update({
      where: { id },
      data: {
        ...data,
        ...patchDate("deadline", data.deadline),
        // Toute modification vaut confirmation « toujours d'actualité » (spec 034) :
        // remet le compteur à zéro, qu'il s'agisse du bouton dédié, d'une édition
        // ordinaire ou d'une republication.
        renewalRequestedAt: null,
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

    const job = await prisma.jobOffer.findUnique({ where: { id }, select: { id: true, authorId: true } });
    if (!job) throw new ApiError(404, "Offre introuvable");

    requireJobsAuthorOrModerator(session, job.authorId);

    await prisma.jobOffer.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
