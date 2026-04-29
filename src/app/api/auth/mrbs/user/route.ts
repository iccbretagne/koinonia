import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { computeMrbsLevel } from "@/modules/mrbs";

function requireMrbsSecret(request: Request): void {
  const secret = process.env.MRBS_API_SECRET;
  if (!secret) throw new ApiError(503, "Module MRBS non configuré");
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) throw new ApiError(401, "Secret MRBS invalide");
}

/**
 * GET /api/auth/mrbs/user
 *
 * Appelé par AuthKoinonia::getUserFresh() pour enrichir un User MRBS.
 *
 * Query params :
 *   username — MRBS username (email ou nom lié via MrbsUserLink)
 *   churchId — churchId configuré dans MRBS config.inc.php
 *
 * Response : { username, display_name, email, level }
 */
export async function GET(request: Request) {
  try {
    requireMrbsSecret(request);

    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username");
    const churchId = searchParams.get("churchId") ?? process.env.MRBS_CHURCH_ID ?? "";

    if (!username) throw new ApiError(400, "Paramètre 'username' requis");
    if (!churchId) throw new ApiError(400, "Paramètre 'churchId' requis");

    // Chercher d'abord via liaison explicite
    const link = await prisma.mrbsUserLink.findUnique({
      where: { mrbsUsername: username },
      select: {
        user: {
          select: { id: true, email: true, name: true, displayName: true, isSuperAdmin: true },
        },
      },
    });

    let user = link?.user ?? null;

    // Fallback : username = email Koinonia
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: username },
        select: { id: true, email: true, name: true, displayName: true, isSuperAdmin: true },
      });
    }

    if (!user) throw new ApiError(404, "Utilisateur introuvable");

    const displayName = user.displayName ?? user.name ?? username;
    const level = await computeMrbsLevel(user.id, churchId, user.isSuperAdmin);

    return successResponse({ username, display_name: displayName, email: user.email, level });
  } catch (error) {
    return errorResponse(error);
  }
}
