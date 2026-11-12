import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { upsertSchema } from "./contract";
import { saveReport } from "./_core";

// GET /api/events/[eventId]/report
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    // reports:view OR events:manage — try both, fail if neither
    let authorized = false;
    for (const perm of ["reports:view", "events:manage"] as const) {
      try {
        await requireChurchPermission(perm, churchId);
        authorized = true;
        break;
      } catch { /* try next */ }
    }
    if (!authorized) throw new ApiError(403, "Accès refusé");

    const report = await prisma.eventReport.findUnique({
      where: { eventId },
      include: {
        sections: {
          include: { department: { select: { id: true, name: true, ministry: { select: { name: true } } } } },
          orderBy: { position: "asc" },
        },
        author: { select: { id: true, name: true } },
      },
    });

    return successResponse(report ?? null);
  } catch (error) {
    return errorResponse(error);
  }
}

// PUT /api/events/[eventId]/report — crée ou remplace le rapport complet
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, churchId: true, reportEnabled: true },
    });
    if (!event) throw new ApiError(404, "Événement introuvable");

    // reports:edit OR events:manage — try both, fail if neither
    let session;
    let putAuthorized = false;
    for (const perm of ["reports:edit", "events:manage"] as const) {
      try {
        session = await requireChurchPermission(perm, event.churchId);
        putAuthorized = true;
        break;
      } catch { /* try next */ }
    }
    if (!putAuthorized || !session) throw new ApiError(403, "Accès refusé");

    if (!event.reportEnabled) throw new ApiError(403, "Les comptes rendus ne sont pas activés pour cet événement");

    const data = upsertSchema.parse(await request.json());

    const report = await saveReport(session, event, data);

    return successResponse(report);
  } catch (error) {
    return errorResponse(error);
  }
}
