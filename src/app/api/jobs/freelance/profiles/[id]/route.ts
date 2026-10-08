import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";
import { JOBS_AUTHOR_INCLUDE, jobsAccess, requireJobsAuthorOrModerator, patchDate } from "@/modules/jobs";

const patchProfileSchema = z.object({
  title:         z.string().min(1).max(200).optional(),
  domain:        z.string().min(1).max(150).optional(),
  dailyRate:     z.string().max(100).nullable().optional(),
  hourlyRate:    z.string().max(100).nullable().optional(),
  modality:      z.enum(["REMOTE", "ONSITE", "HYBRID"]).optional(),
  location:      z.string().max(150).nullable().optional(),
  availableFrom: z.string().datetime().nullable().optional(),
  description:   z.string().min(1).optional(),
  contactEmail:  z.string().email().max(150).nullable().optional(),
  contactUrl:    z.string().url().max(500).nullable().optional(),
  status:        z.enum(["ACTIVE", "UNAVAILABLE", "ARCHIVED"]).optional(),
});

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
