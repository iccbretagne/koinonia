/**
 * GET/POST /api/audio/shares — partage de bibliothèque audio entre églises (spec 036).
 * Réservé à `audio:manage` (ADMIN/SUPER_ADMIN) dans l'église courante : administrer le partage
 * n'est pas une action d'écoute, `requireAudioListenAccess` ne s'applique pas ici.
 *
 * Le POST résout en deux temps (`confirm`) plutôt que d'exposer un endpoint de résolution
 * séparé : une seule surface d'énumération identifiant → nom, gardée par `audio:manage` et
 * limitée en débit (plan.md).
 */
import { z } from "zod";
import { requireCurrentChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
import { listOutgoingShares, grantLibraryShare } from "@/modules/audio";

export async function GET() {
  try {
    const { churchId } = await requireCurrentChurchPermission("audio:manage");

    const church = await prisma.church.findUnique({ where: { id: churchId }, select: { slug: true } });
    if (!church) throw new ApiError(404, "Église introuvable");

    const shares = await listOutgoingShares(churchId);

    return successResponse({
      ownSlug: church.slug,
      shares: shares.map((s) => ({
        id: s.id,
        churchName: s.churchName,
        churchSlug: s.churchSlug,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const postSchema = z.object({
  slug: z.string().trim().min(1, "Identifiant requis"),
  confirm: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const { session, churchId } = await requireCurrentChurchPermission("audio:manage");
    requireRateLimit(request, { prefix: `audio-shares:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });

    const { slug, confirm } = postSchema.parse(await request.json());

    const result = await grantLibraryShare(churchId, slug, { confirmOnly: !confirm });

    if (!confirm) {
      return successResponse({ churchName: result.churchName });
    }

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "CREATE",
      entityType: "AudioLibraryShare",
      entityId: result.shareId as string,
      details: { guestChurchId: result.churchId, guestChurchName: result.churchName },
    });

    return successResponse(
      { id: result.shareId, churchName: result.churchName, churchId: result.churchId, createdAt: result.createdAt },
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}
