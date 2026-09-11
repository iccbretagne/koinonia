import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { canManageOpeningClosing } from "@/modules/planning";

/**
 * Recherche de membres pour désigner un service d'ouverture/fermeture (spec 041) —
 * « n'importe quel membre de l'église », donc pas de scoping département comme `/api/members`
 * (dont le scoping par responsabilité ne convient pas ici : un responsable Sécurité doit
 * pouvoir désigner un membre en dehors de son département).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:view", churchId);

    if (!(await canManageOpeningClosing(session, churchId))) {
      throw new ApiError(403, "Droit insuffisant");
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    const members = await prisma.member.findMany({
      where: {
        departments: { some: { department: { ministry: { churchId } } } },
        ...(q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }] } : {}),
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 25,
    });

    return successResponse(members);
  } catch (error) {
    return errorResponse(error);
  }
}
