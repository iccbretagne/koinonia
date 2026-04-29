import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

function requireMrbsSecret(request: Request): void {
  const secret = process.env.MRBS_API_SECRET;
  if (!secret) throw new ApiError(503, "Module MRBS non configuré");
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) throw new ApiError(401, "Secret MRBS invalide");
}

/**
 * GET /api/auth/mrbs/users
 *
 * Appelé par AuthKoinonia::getUsernames() pour peupler la liste des
 * utilisateurs dans l'interface admin MRBS.
 * Ne retourne que les utilisateurs level ≥ 1 de l'église.
 *
 * Query params :
 *   churchId — churchId configuré dans MRBS config.inc.php
 *
 * Response : [{ username, display_name }]
 */
export async function GET(request: Request) {
  try {
    requireMrbsSecret(request);

    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId") ?? process.env.MRBS_CHURCH_ID ?? "";
    if (!churchId) throw new ApiError(400, "Paramètre 'churchId' requis");

    // 1. Utilisateurs avec un rôle level≥1 dans cette église
    const churchRoles = await prisma.userChurchRole.findMany({
      where: {
        churchId,
        role: { in: ["SUPER_ADMIN", "ADMIN", "MINISTER", "DEPARTMENT_HEAD"] },
      },
      select: {
        user: { select: { id: true, email: true, name: true, displayName: true } },
      },
    });

    // 2. Adjoints (isDeputy) dans cette église
    const deputies = await prisma.userDepartment.findMany({
      where: { isDeputy: true, userChurchRole: { churchId } },
      select: {
        userChurchRole: {
          select: {
            user: { select: { id: true, email: true, name: true, displayName: true } },
          },
        },
      },
    });

    // 3. Super admins globaux
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true },
      select: { id: true, email: true, name: true, displayName: true },
    });

    // 4. Dédupliquer par id
    const seen = new Map<string, { id: string; email: string | null; name: string | null; displayName: string | null }>();
    for (const r of churchRoles) seen.set(r.user.id, r.user);
    for (const d of deputies) seen.set(d.userChurchRole.user.id, d.userChurchRole.user);
    for (const u of superAdmins) seen.set(u.id, u);

    // 5. Liaisons MRBS explicites (username override)
    const links = await prisma.mrbsUserLink.findMany({
      where: { churchId },
      select: { mrbsUsername: true, userId: true },
    });
    const linkByUserId = new Map(links.map((l) => [l.userId, l.mrbsUsername]));

    const result = [...seen.values()]
      .map((u) => ({
        username: linkByUserId.get(u.id) ?? u.email ?? u.id,
        display_name: u.displayName ?? u.name ?? u.email ?? u.id,
      }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "fr"));

    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
