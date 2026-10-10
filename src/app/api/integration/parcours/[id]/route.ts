import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireIntegrationFullAccess } from "@/modules/integration";
import { logAudit } from "@/lib/audit";
import type { z } from "zod";
import { patchSchema } from "./contract";

type JourneyPatch = z.infer<typeof patchSchema>;

/** Étapes du parcours : l'indicateur et sa date, posée à maintenant si l'étape est cochée sans date. */
const MILESTONES = [
  ["integratedInFamily", "familyIntegratedAt"],
  ["followsPcnc", "pcncStartedAt"],
  ["isStar", "starSince"],
  ["inDiscipleship", "discipleshipSince"],
] as const;

function journeyUpdateData(body: JourneyPatch, now: Date): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [flag, dateKey] of MILESTONES) {
    const checked = body[flag];
    const date = body[dateKey];
    if (checked !== undefined) {
      data[flag] = checked;
      if (checked && date === undefined) data[dateKey] = now;
    }
    if (date !== undefined) data[dateKey] = date ? new Date(date) : null;
  }
  if (body.notes !== undefined) data.notes = body.notes;
  return data;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const journey = await prisma.personJourney.findUnique({
      where: { id },
      include: {
        sourceRequest: {
          select: {
            id: true,
            status: true,
            assignedFamilyName: true,
            msdpFollowUp: { select: { id: true, status: true } },
          },
        },
      },
    });
    if (!journey) throw new ApiError(404, "Dossier introuvable");

    await requireIntegrationFullAccess(journey.churchId);

    return successResponse(journey);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const journey = await prisma.personJourney.findUnique({
      where: { id },
      select: { id: true, churchId: true },
    });
    if (!journey) throw new ApiError(404, "Dossier introuvable");

    const { session } = await requireIntegrationFullAccess(journey.churchId);

    const body = patchSchema.parse(await request.json());

    const data = journeyUpdateData(body, new Date());

    const updated = await prisma.personJourney.update({
      where: { id },
      data,
      include: {
        sourceRequest: { select: { id: true, status: true, assignedFamilyName: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: journey.churchId,
      action: "UPDATE",
      entityType: "PersonJourney",
      entityId: id,
      details: body,
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const journey = await prisma.personJourney.findUnique({
      where: { id },
      select: { id: true, churchId: true },
    });
    if (!journey) throw new ApiError(404, "Dossier introuvable");

    const { session } = await requireIntegrationFullAccess(journey.churchId);

    await prisma.personJourney.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      churchId: journey.churchId,
      action: "DELETE",
      entityType: "PersonJourney",
      entityId: id,
    });

    return successResponse({ id });
  } catch (error) {
    return errorResponse(error);
  }
}
