import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { createMediaShareToken, getTokenUrlPath } from "@/modules/media";
import { z } from "zod";

const createSchema = z.object({
  type: z.enum(["VALIDATOR", "MEDIA", "PREVALIDATOR", "GALLERY"]),
  label: z.string().optional(),
  expiresInDays: z.number().int().positive().optional(),
  onlyApproved: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("mediaEvent", id);
    await requireChurchPermission("media:view", churchId);

    const tokens = await prisma.mediaShareToken.findMany({
      where: { mediaEventId: id },
      orderBy: { createdAt: "desc" },
    });

    const baseUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

    return successResponse(
      tokens.map((t) => ({
        ...t,
        url: `${baseUrl}/media/${getTokenUrlPath(t.type)}/${t.token}`,
      }))
    );
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
    const churchId = await resolveChurchId("mediaEvent", id);
    await requireChurchPermission("media:upload", churchId);

    const body = await request.json();
    const data = createSchema.parse(body);

    // Rule: only one PREVALIDATOR per event
    if (data.type === "PREVALIDATOR") {
      const existing = await prisma.mediaShareToken.count({
        where: { mediaEventId: id, type: "PREVALIDATOR" },
      });
      if (existing > 0) {
        throw new ApiError(409, "Un lien de prévalidation existe déjà pour cet événement");
      }
    }

    // Rule: block VALIDATOR/MEDIA if prevalidation active and pending photos remain
    if (data.type === "VALIDATOR" || data.type === "MEDIA") {
      const hasPrevalidator = await prisma.mediaShareToken.count({
        where: { mediaEventId: id, type: "PREVALIDATOR" },
      });
      if (hasPrevalidator > 0) {
        const pendingCount = await prisma.mediaPhoto.count({
          where: { mediaEventId: id, status: "PENDING" },
        });
        if (pendingCount > 0) {
          throw new ApiError(
            409,
            `La prévalidation est en cours (${pendingCount} photo(s) restante(s)). Terminez la prévalidation avant de créer un lien de validation.`
          );
        }
      }
    }

    const token = await createMediaShareToken({
      mediaEventId: id,
      type: data.type,
      label: data.label,
      expiresInDays: data.expiresInDays,
      onlyApproved: data.onlyApproved,
    });

    return successResponse(token, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("mediaEvent", id);
    await requireChurchPermission("media:upload", churchId);

    const tokenId = new URL(request.url).searchParams.get("tokenId");
    if (!tokenId) throw new ApiError(400, "tokenId requis");

    await prisma.mediaShareToken.delete({
      where: { id: tokenId, mediaEventId: id },
    });

    return successResponse({ deleted: tokenId });
  } catch (error) {
    return errorResponse(error);
  }
}
