import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
import { onboardSchema } from "./contract";

async function requireSuperAdmin() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "Réservé aux super-administrateurs");
  return session;
}

export async function POST(request: Request) {
  try {
    const session = await requireSuperAdmin();
    requireRateLimit(request, { prefix: `onboard:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });
    const body = await request.json();
    const { name, slug, adminEmail } = onboardSchema.parse(body);

    // Check slug uniqueness
    const existing = await prisma.church.findUnique({ where: { slug } });
    if (existing) {
      throw new ApiError(409, "Cet identifiant est déjà utilisé");
    }

    const church = await prisma.$transaction(async (tx) => {
      const newChurch = await tx.church.create({
        data: { name, slug },
      });

      // Ministère + département système « Sans département » : parking pour un STAR sans
      // département réel (détachement de sa dernière affiliation) et pour un disciple créé sans
      // fiche STAR (POST /api/discipleships). Sans cette entrée, les deux échouent (cf. seed.ts,
      // qui la crée pour l'église de développement, et la migration 20260320000001 qui l'avait
      // rétro-créée pour les églises existant à cette date — jamais reproduit ici depuis).
      await tx.ministry.create({
        data: {
          name: "Système",
          churchId: newChurch.id,
          isSystem: true,
          departments: {
            create: { name: "Sans département", isSystem: true },
          },
        },
      });

      // If admin email specified, create or find user and assign ADMIN role
      if (adminEmail) {
        let user = await tx.user.findUnique({ where: { email: adminEmail } });

        user ??= await tx.user.create({
          data: { email: adminEmail },
        });

        await tx.userChurchRole.create({
          data: {
            userId: user.id,
            churchId: newChurch.id,
            role: "ADMIN",
          },
        });
      }

      // Also give the current super admin access
      await tx.userChurchRole.upsert({
        where: {
          userId_churchId_role: {
            userId: session.user.id,
            churchId: newChurch.id,
            role: "SUPER_ADMIN",
          },
        },
        update: {},
        create: {
          userId: session.user.id,
          churchId: newChurch.id,
          role: "SUPER_ADMIN",
        },
      });

      return newChurch;
    });

    await logAudit({
      userId: session.user.id,
      churchId: church.id,
      action: "CREATE",
      entityType: "Church",
      entityId: church.id,
      details: { name, slug, adminEmail },
    });

    return successResponse(church, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
