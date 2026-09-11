import { prisma } from "@/lib/prisma";
import { requireCurrentChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { canReadAnnouncementSheet } from "@/modules/planning";

/** Liste des événements à venir de l'église courante, avec leur feuille d'annonces éventuelle. */
export async function GET(request: Request) {
  try {
    const { session, churchId } = await requireCurrentChurchPermission("planning:view");

    if (!(await canReadAnnouncementSheet(session, churchId))) {
      throw new ApiError(403, "Droit insuffisant pour consulter les feuilles d'annonces");
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const events = await prisma.event.findMany({
      where: {
        churchId,
        date: {
          gte: from ? new Date(from) : new Date(),
          ...(to ? { lte: new Date(to) } : {}),
        },
      },
      select: {
        id: true,
        title: true,
        date: true,
        announcementSheet: { select: { filename: true, uploadedAt: true } },
      },
      orderBy: { date: "asc" },
    });

    return successResponse(
      events.map((e) => ({
        event: { id: e.id, title: e.title, date: e.date.toISOString() },
        sheet: e.announcementSheet
          ? { filename: e.announcementSheet.filename, uploadedAt: e.announcementSheet.uploadedAt.toISOString() }
          : null,
      }))
    );
  } catch (error) {
    return errorResponse(error);
  }
}
