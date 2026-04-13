/**
 * GET/POST /api/media/files/[id]/comments
 * Commentaires de révision sur un fichier média.
 */
import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const postSchema = z.object({
  content: z.string().min(1),
  type: z.enum(["GENERAL", "TIMECODE"]).default("GENERAL"),
  timecode: z.number().int().nonnegative().optional(),
  parentId: z.string().optional(),
});

async function resolveFileChurchId(fileId: string) {
  const file = await prisma.mediaFile.findUnique({
    where: { id: fileId },
    include: {
      mediaEvent: { select: { churchId: true } },
      mediaProject: { select: { churchId: true } },
    },
  });
  if (!file) throw new ApiError(404, "Fichier introuvable");
  return file.mediaEvent?.churchId ?? file.mediaProject?.churchId ?? (() => { throw new ApiError(500, "Fichier sans conteneur"); })();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveFileChurchId(id);
    await requireChurchPermission("media:view", churchId);

    const comments = await prisma.mediaComment.findMany({
      where: { mediaFileId: id, parentId: null },
      include: {
        author: { select: { id: true, name: true, displayName: true } },
        replies: {
          include: {
            author: { select: { id: true, name: true, displayName: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return successResponse(comments);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveFileChurchId(id);
    const session = await requireChurchPermission("media:view", churchId);

    const body = await request.json();
    const data = postSchema.parse(body);

    if (data.parentId) {
      const parent = await prisma.mediaComment.findUnique({ where: { id: data.parentId } });
      if (!parent || parent.mediaFileId !== id) throw new ApiError(400, "Commentaire parent invalide");
    }

    const comment = await prisma.mediaComment.create({
      data: {
        content: data.content,
        type: data.type,
        timecode: data.timecode,
        parentId: data.parentId,
        mediaFileId: id,
        authorId: session.user.id,
        authorName: session.user.displayName ?? session.user.name ?? null,
        authorImage: session.user.image ?? null,
      },
      include: {
        author: { select: { id: true, name: true, displayName: true } },
      },
    });

    return successResponse(comment, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
