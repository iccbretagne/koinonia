import { z } from "zod";
import { requireChurchPermission, resolveChurchId, requireDepartmentAccess } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { createTeamEvent, listDepartmentTeamEvents } from "@/modules/planning";

function isValidDate(val: string) {
  return !isNaN(new Date(val).getTime());
}

const writeFields = {
  title: z.string().trim().min(1, "Le titre est requis").max(200),
  startsAt: z.string().min(1, "La date de début est requise").refine(isValidDate, "Date de début invalide"),
  endsAt: z.string().min(1, "La date de fin est requise").refine(isValidDate, "Date de fin invalide"),
  location: z.string().trim().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
};

const createSchema = z
  .object({
    ...writeFields,
    recurrence: z
      .object({
        rule: z.enum(["weekly", "biweekly", "monthly"]),
        until: z.string().min(1, "La date de fin de récurrence est requise").refine(isValidDate, "Date de fin de récurrence invalide"),
      })
      .nullable()
      .optional(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "L'heure de fin doit être postérieure à l'heure de début",
    path: ["endsAt"],
  });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    const { departmentId } = await params;
    const churchId = await resolveChurchId("department", departmentId);
    const session = await requireChurchPermission("planning:department", churchId);
    requireDepartmentAccess(session, churchId, departmentId);

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") === "past" ? "past" : "upcoming";

    const teamEvents = await listDepartmentTeamEvents(departmentId, period);
    return successResponse(teamEvents);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    const { departmentId } = await params;
    const churchId = await resolveChurchId("department", departmentId);
    const session = await requireChurchPermission("planning:edit", churchId);
    requireDepartmentAccess(session, churchId, departmentId);

    const body = createSchema.parse(await request.json());

    const { created, truncated } = await createTeamEvent({
      churchId,
      departmentId,
      userId: session.user.id,
      input: {
        title: body.title,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        location: body.location ?? null,
        description: body.description ?? null,
        recurrence: body.recurrence
          ? { rule: body.recurrence.rule, until: new Date(body.recurrence.until) }
          : null,
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "CREATE",
      entityType: "TeamEvent",
      entityId: departmentId,
      details: { title: body.title, created, truncated },
    });

    return successResponse({ created, truncated }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
