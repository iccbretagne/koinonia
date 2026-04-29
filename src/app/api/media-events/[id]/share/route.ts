import { prisma } from "@/lib/prisma";
import { requireMediaAccess, requireMediaUploadAccess, requireMediaManageAccess, isProductionMediaMember, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { createMediaShareToken, getTokenUrlPath } from "@/modules/media";
import { z } from "zod";

const SENSITIVE_TOKEN_TYPES = ["VALIDATOR", "PREVALIDATOR"] as const;

const createSchema = z.object({
  type: z.enum(["VALIDATOR", "MEDIA", "MEDIA_ALL", "PREVALIDATOR", "GALLERY"]),
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
    const session = await requireMediaAccess(churchId);

    const tokens = await prisma.mediaShareToken.findMany({
      where: { mediaEventId: id },
      orderBy: { createdAt: "desc" },
    });

    const baseUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

    // Vérifier si l'utilisateur peut voir les tokens sensibles (media:manage OU PRODUCTION_MEDIA)
    const { rolePermissions } = await import("@/lib/registry");
    const userRoles = session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .map((r) => r.role);
    const canManage =
      session.user.isSuperAdmin ||
      userRoles.some((role) => (rolePermissions[role] ?? []).includes("media:manage")) ||
      await isProductionMediaMember(session, churchId);

    return successResponse(
      tokens.map((t) => {
        const isSensitive = (SENSITIVE_TOKEN_TYPES as readonly string[]).includes(t.type);
        const token = isSensitive && !canManage ? undefined : t.token;
        const url =
          isSensitive && !canManage
            ? undefined
            : `${baseUrl}/media/${getTokenUrlPath(t.type)}/${t.token}`;
        return { ...t, token, url };
      })
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
    await requireMediaUploadAccess(churchId);

    const body = await request.json();
    const data = createSchema.parse(body);

    // Les tokens VALIDATOR et PREVALIDATOR donnent accès à des actions d'approbation :
    // exiger media:manage
    if ((SENSITIVE_TOKEN_TYPES as readonly string[]).includes(data.type)) {
      await requireMediaManageAccess(churchId);
    }

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
    await requireMediaUploadAccess(churchId);

    const tokenId = new URL(request.url).searchParams.get("tokenId");
    if (!tokenId) throw new ApiError(400, "tokenId requis");

    // Charger le token pour connaître son type avant suppression
    const existingToken = await prisma.mediaShareToken.findUnique({
      where: { id: tokenId },
      select: { type: true },
    });
    if (!existingToken) throw new ApiError(404, "Token introuvable");

    // Les tokens sensibles (VALIDATOR/PREVALIDATOR) nécessitent media:manage
    if ((SENSITIVE_TOKEN_TYPES as readonly string[]).includes(existingToken.type)) {
      await requireMediaManageAccess(churchId);
    }

    await prisma.mediaShareToken.delete({
      where: { id: tokenId, mediaEventId: id },
    });

    return successResponse({ deleted: tokenId });
  } catch (error) {
    return errorResponse(error);
  }
}
