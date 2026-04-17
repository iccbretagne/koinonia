import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { createMediaShareToken, getTokenUrlPath } from "@/modules/media";
import { z } from "zod";

const SENSITIVE_TOKEN_TYPES = ["VALIDATOR", "PREVALIDATOR"] as const;

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
    const churchId = await resolveChurchId("mediaProject", id);
    const session = await requireChurchPermission("media:view", churchId);

    const tokens = await prisma.mediaShareToken.findMany({
      where: { mediaProjectId: id },
      orderBy: { createdAt: "desc" },
    });

    const baseUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

    // Vérifier si l'utilisateur a la permission media:manage pour voir les tokens sensibles
    const { rolePermissions } = await import("@/lib/registry");
    const userRoles = session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .map((r) => r.role);
    const canManage =
      session.user.isSuperAdmin ||
      userRoles.some((role) =>
        (rolePermissions[role] ?? []).includes("media:manage")
      );

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
    const churchId = await resolveChurchId("mediaProject", id);
    await requireChurchPermission("media:upload", churchId);

    const body = await request.json();
    const data = createSchema.parse(body);

    // Les tokens VALIDATOR et PREVALIDATOR donnent accès à des actions d'approbation :
    // exiger media:manage
    if ((SENSITIVE_TOKEN_TYPES as readonly string[]).includes(data.type)) {
      await requireChurchPermission("media:manage", churchId);
    }

    const token = await createMediaShareToken({
      mediaProjectId: id,
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
    const churchId = await resolveChurchId("mediaProject", id);
    await requireChurchPermission("media:upload", churchId);

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
      await requireChurchPermission("media:manage", churchId);
    }

    await prisma.mediaShareToken.delete({
      where: { id: tokenId, mediaProjectId: id },
    });

    return successResponse({ deleted: tokenId });
  } catch (error) {
    return errorResponse(error);
  }
}
