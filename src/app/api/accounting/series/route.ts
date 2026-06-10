import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const createSchema = z.object({
  departmentId:      z.string().min(1),
  label:             z.string().min(1).max(200),
  description:       z.string().optional(),
  amount:            z.number().positive(),
  recurrenceEvery:   z.number().int().min(1).max(99),
  recurrenceUnit:    z.enum(["WEEK", "MONTH"]),
  firstOccurrenceDate: z.string().datetime(),
});

export async function GET(request: Request) {
  try {
    const session = await requirePermission("accounting:view");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;

    const series = await prisma.financialSeries.findMany({
      where: {
        churchId,
        ...(status ? { status: status as never } : {}),
      },
      include: {
        department:  { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        _count:      { select: { requests: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(series);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("accounting:submit");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const body = createSchema.parse(await request.json());

    const dept = await prisma.department.findFirst({
      where: { id: body.departmentId, ministry: { churchId } },
    });
    if (!dept) throw new ApiError(404, "Département introuvable");

    const firstDate = new Date(body.firstOccurrenceDate);

    const [series] = await prisma.$transaction(async (tx) => {
      const s = await tx.financialSeries.create({
        data: {
          churchId,
          departmentId:      body.departmentId,
          submittedById:     session.user.id!,
          type:              "BUDGET_ADVANCE",
          label:             body.label,
          description:       body.description,
          amount:            body.amount,
          recurrenceEvery:   body.recurrenceEvery,
          recurrenceUnit:    body.recurrenceUnit,
          status:            "ACTIVE",
          nextOccurrenceDate: firstDate,
        },
      });

      // Créer la première occurrence
      await tx.financialRequest.create({
        data: {
          churchId,
          departmentId:    body.departmentId,
          submittedById:   session.user.id!,
          seriesId:        s.id,
          occurrenceNumber: 1,
          type:            "BUDGET_ADVANCE",
          label:           body.label,
          description:     body.description,
          amount:          body.amount,
          status:          "SUBMITTED",
        },
      });

      return [s];
    });

    return successResponse(series, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
