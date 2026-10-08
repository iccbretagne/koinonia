import { prisma } from "@/lib/prisma";
import { requireMediaAccess, requireMediaUploadAccess, requireMediaManageAccess, isMediaTeamMember, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { createMediaShareToken, getTokenUrlPath } from "@/modules/media";
import { z } from "zod";

const SENSITIVE_TOKEN_TYPES: ReadonlySet<string> = new Set(["VALIDATOR", "PREVALIDATOR"]);

const createSchema = z.object({
  type: z.enum(["VALIDATOR", "MEDIA", "MEDIA_ALL", "PREVALIDATOR", "GALLERY"]),
  label: z.string().optional(),
  expiresInDays: z.number().int().positive().optional(),
  onlyApproved: z.boolean().optional(),
});

type ShareTokenType = z.infer<typeof createSchema>["type"];
type RouteContext = { params: Promise<{ id: string }> };

/**
 * Liens de partage d'un objet média (événement photos ou projet visuels) : mêmes règles
 * de visibilité et de droits, seule la cible et l'équipe changent.
 */
export interface MediaShareTarget {
  resource: "mediaEvent" | "mediaProject";
  domain: "PHOTOS" | "VISUELS";
  /** L'équipe du domaine voit aussi les tokens sensibles (sinon : media:manage seul). */
  teamSeesSensitive: boolean;
  /** Règles propres à la cible, vérifiées avant la création d'un token. */
  beforeCreate?: (id: string, type: ShareTokenType) => Promise<void>;
}

function ownerWhere(target: MediaShareTarget, id: string) {
  return target.resource === "mediaEvent" ? { mediaEventId: id } : { mediaProjectId: id };
}

export function mediaShareHandlers(target: MediaShareTarget) {
  const { resource, domain } = target;

  async function GET(request: Request, { params }: RouteContext) {
    try {
      const { id } = await params;
      const churchId = await resolveChurchId(resource, id);
      const session = await requireMediaAccess(churchId, domain);

      const tokens = await prisma.mediaShareToken.findMany({
        where: ownerWhere(target, id),
        orderBy: { createdAt: "desc" },
      });

      const baseUrl = new URL(request.url).origin;

      // Les tokens sensibles ne sont visibles qu'avec media:manage (ou l'équipe, selon la cible)
      const { rolePermissions } = await import("@/lib/registry");
      const userRoles = session.user.churchRoles
        .filter((r) => r.churchId === churchId)
        .map((r) => r.role);
      const canManage =
        session.user.isSuperAdmin ||
        userRoles.some((role) => (rolePermissions[role] ?? []).includes("media:manage")) ||
        (target.teamSeesSensitive && (await isMediaTeamMember(session, churchId, domain)));

      return successResponse(
        tokens.map((t) => {
          const hidden = SENSITIVE_TOKEN_TYPES.has(t.type) && !canManage;
          return {
            ...t,
            token: hidden ? undefined : t.token,
            url: hidden ? undefined : `${baseUrl}/media/${getTokenUrlPath(t.type)}/${t.token}`,
          };
        })
      );
    } catch (error) {
      return errorResponse(error);
    }
  }

  async function POST(request: Request, { params }: RouteContext) {
    try {
      const { id } = await params;
      const churchId = await resolveChurchId(resource, id);
      await requireMediaUploadAccess(churchId, domain);

      const data = createSchema.parse(await request.json());

      // Les tokens VALIDATOR et PREVALIDATOR donnent accès à des actions d'approbation :
      // exiger media:manage
      if (SENSITIVE_TOKEN_TYPES.has(data.type)) {
        await requireMediaManageAccess(churchId, domain);
      }

      await target.beforeCreate?.(id, data.type);

      const token = await createMediaShareToken({
        churchId,
        ...ownerWhere(target, id),
        type: data.type,
        label: data.label,
        expiresInDays: data.expiresInDays,
        onlyApproved: data.onlyApproved,
        baseUrl: new URL(request.url).origin,
      });

      return successResponse(token, 201);
    } catch (error) {
      return errorResponse(error);
    }
  }

  async function DELETE(request: Request, { params }: RouteContext) {
    try {
      const { id } = await params;
      const churchId = await resolveChurchId(resource, id);
      await requireMediaUploadAccess(churchId, domain);

      const tokenId = new URL(request.url).searchParams.get("tokenId");
      if (!tokenId) throw new ApiError(400, "tokenId requis");

      // Charger le token pour connaître son type avant suppression
      const existingToken = await prisma.mediaShareToken.findUnique({
        where: { id: tokenId },
        select: { type: true },
      });
      if (!existingToken) throw new ApiError(404, "Token introuvable");

      // Les tokens sensibles (VALIDATOR/PREVALIDATOR) nécessitent media:manage
      if (SENSITIVE_TOKEN_TYPES.has(existingToken.type)) {
        await requireMediaManageAccess(churchId, domain);
      }

      await prisma.mediaShareToken.delete({
        where: { id: tokenId, ...ownerWhere(target, id) },
      });

      return successResponse({ deleted: tokenId });
    } catch (error) {
      return errorResponse(error);
    }
  }

  return { GET, POST, DELETE };
}
