import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const job = await prisma.jobOffer.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
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

    const isAuthor  = job.authorId === session.user.id;
    const canManage = session.user.isSuperAdmin ||
      session.user.churchRoles?.some((r) =>
        ["SUPER_ADMIN", "ADMIN", "SECRETARY"].includes(r.role)
      );

    if (!isAuthor && !canManage) {
      throw new ApiError(403, "Accès refusé");
    }

    const body = await request.json();
    const data = patchSchema.parse(body);

    const updated = await prisma.jobOffer.update({
      where: { id },
      data: {
        ...data,
        ...(data.deadline !== undefined ? { deadline: data.deadline ? new Date(data.deadline) : null } : {}),
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

    const job = await prisma.jobOffer.findUnique({ where: { id }, select: { id: true, authorId: true } });
    if (!job) throw new ApiError(404, "Offre introuvable");

    const isAuthor  = job.authorId === session.user.id;
    const canManage = session.user.isSuperAdmin ||
      session.user.churchRoles?.some((r) =>
        ["SUPER_ADMIN", "ADMIN", "SECRETARY"].includes(r.role)
      );

    if (!isAuthor && !canManage) {
      throw new ApiError(403, "Accès refusé");
    }

    await prisma.jobOffer.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
