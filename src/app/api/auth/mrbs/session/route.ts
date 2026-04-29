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
 * GET /api/auth/mrbs/session
 *
 * Appelé par SessionKoinonia (PHP) à chaque requête MRBS.
 * Reçoit le session token NextAuth du cookie navigateur et retourne
 * les infos MRBS de l'utilisateur correspondant.
 *
 * Query params :
 *   token    — valeur du cookie authjs.session-token
 *   churchId — churchId configuré dans MRBS config.inc.php
 *
 * Response : { username, display_name, level, email }
 */
export async function GET(request: Request) {
  try {
    requireMrbsSecret(request);

    const { searchParams } = new URL(request.url);
    // Token : header (SessionKoinonia.php) ou query param (tests directs)
    const token =
      request.headers.get("x-mrbs-session-token") ??
      searchParams.get("token");
    // ChurchId : header (SessionKoinonia.php) > query param > env var
    const churchId =
      request.headers.get("x-koinonia-church-id") ??
      searchParams.get("churchId") ??
      process.env.MRBS_CHURCH_ID ??
      "";

    if (!token) throw new ApiError(400, "Paramètre 'token' requis");
    if (!churchId) throw new ApiError(400, "Paramètre 'churchId' requis");

    // Chercher la session en DB (Auth.js database sessions)
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      select: {
        expires: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            displayName: true,
            isSuperAdmin: true,
          },
        },
      },
    });

    if (!session || !session.user) throw new ApiError(401, "Session invalide");
    if (new Date(session.expires) < new Date()) throw new ApiError(401, "Session expirée");

    const { user } = session;

    // Chercher une liaison MRBS explicite (moulinette)
    const link = await prisma.mrbsUserLink.findFirst({
      where: { userId: user.id, churchId },
      select: { mrbsUsername: true },
    });

    // username = liaison explicite > email Koinonia
    const username = link?.mrbsUsername ?? user.email ?? user.id;
    const displayName = user.displayName ?? user.name ?? username;
    const level = await computeMrbsLevel(user.id, churchId, user.isSuperAdmin);

    console.log("[mrbs/session]", {
      userId: user.id,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      churchId,
      level,
    });

    return successResponse({ username, display_name: displayName, email: user.email, level });
  } catch (error) {
    return errorResponse(error);
  }
}
