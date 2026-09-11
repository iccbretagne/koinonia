import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Nombre d'offres d'emploi publiées depuis la dernière visite de l'utilisateur sur `/jobs`
 * (pastille "nouvelles offres" du menu, spec 042). Module emploi transversal, sans `churchId` —
 * voir `src/modules/jobs/manifest.ts`.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const userId = session.user.id!;

    const lastSeen = await prisma.jobLastSeen.findUnique({
      where: { userId },
      select: { seenAt: true },
    });
    const since = lastSeen?.seenAt ?? new Date(Date.now() - THIRTY_DAYS_MS);

    const count = await prisma.jobOffer.count({
      where: {
        status: "PUBLISHED",
        authorId: { not: userId },
        createdAt: { gt: since },
      },
    });

    return successResponse({ count });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Marque la visite de `/jobs` : remet le compteur à zéro. */
export async function POST() {
  try {
    const session = await requireAuth();
    const userId = session.user.id!;

    await prisma.jobLastSeen.upsert({
      where: { userId },
      create: { userId },
      update: { seenAt: new Date() },
    });

    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
