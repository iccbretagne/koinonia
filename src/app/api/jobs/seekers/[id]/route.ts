import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

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

    const seeker = await prisma.jobSeeker.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
    });

    if (!seeker) throw new ApiError(404, "Profil introuvable");

    const isAuthor  = seeker.authorId === session.user.id;
    const canManage = canManageJobs(session);

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

    const isAuthor  = seeker.authorId === session.user.id;
    const canManage = canManageJobs(session);

    if (!isAuthor && !canManage) throw new ApiError(403, "Accès refusé");

    const data = patchSeekerSchema.parse(await request.json());

    // Seul un admin/secrétaire peut archiver
    if (data.status === "ARCHIVED" && !canManage) {
      throw new ApiError(403, "Seul un modérateur peut archiver un profil");
    }
    // Seul l'auteur peut passer à FOUND (ou admin)
    if (data.status === "FOUND" && !isAuthor && !canManage) {
      throw new ApiError(403, "Accès refusé");
    }

    const updated = await prisma.jobSeeker.update({
      where: { id },
      data: {
        ...data,
        ...(data.availableFrom !== undefined
          ? { availableFrom: data.availableFrom ? new Date(data.availableFrom) : null }
          : {}),
      },
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

    const seeker = await prisma.jobSeeker.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });

    if (!seeker) throw new ApiError(404, "Profil introuvable");

    const isAuthor  = seeker.authorId === session.user.id;
    const canManage = canManageJobs(session);

    if (!isAuthor && !canManage) throw new ApiError(403, "Accès refusé");

    await prisma.jobSeeker.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
