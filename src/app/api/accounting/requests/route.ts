import { requireCurrentChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  assertAttachmentsAssignable,
  getAccountingDepartmentScope,
  accountingScopeWhere,
  notifyAccountingNewRequest,
} from "@/modules/accounting";
import { createSchema } from "./contract";

export async function GET(request: Request) {
  try {
    const { session, churchId } = await requireCurrentChurchPermission("accounting:view");

    const { searchParams } = new URL(request.url);
    const status     = searchParams.get("status") ?? undefined;
    const departmentId = searchParams.get("departmentId") ?? undefined;
    const type       = searchParams.get("type") ?? undefined;

    // Le filtre ?departmentId= restreint le périmètre autorisé, il ne le remplace jamais.
    const scope = await getAccountingDepartmentScope(session, churchId);

    const requests = await prisma.financialRequest.findMany({
      where: {
        churchId,
        ...(status ? { status: status as never } : {}),
        ...(type ? { type: type as never } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...accountingScopeWhere(scope, session.user.id!),
      },
      include: {
        department:  { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        processedBy: { select: { id: true, name: true } },
        payments:    { orderBy: { scheduledDate: "asc" } },
        attachments: { select: { id: true, filename: true, mimeType: true, size: true, s3Key: true } },
        series:      { select: { id: true, label: true, recurrenceEvery: true, recurrenceUnit: true } },
        correctionOf: { select: { id: true, label: true } },
        _count:      { select: { corrections: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(requests);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, churchId } = await requireCurrentChurchPermission("accounting:submit");

    const body = createSchema.parse(await request.json());

    // Vérifier que le département appartient à l'église (si fourni)
    if (body.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: body.departmentId, ministry: { churchId } },
      });
      if (!dept) throw new ApiError(404, "Département introuvable");
    }

    // Une correction ne peut porter que sur sa propre demande rejetée, dans cette église
    if (body.correctionOfId) {
      const original = await prisma.financialRequest.findFirst({
        where: { id: body.correctionOfId, churchId, submittedById: session.user.id!, status: "REJECTED" },
        select: { id: true },
      });
      if (!original) throw new ApiError(404, "Demande à corriger introuvable");
    }

    const req = await prisma.$transaction(async (tx) => {
      if (body.attachmentIds?.length) {
        await assertAttachmentsAssignable(
          body.attachmentIds,
          { userId: session.user.id!, churchId },
          tx
        );
      }

      return tx.financialRequest.create({
        data: {
          churchId,
          departmentId: body.departmentId ?? undefined,
          submittedById: session.user.id!,
          type:        body.type,
          label:       body.label,
          description: body.description,
          amount:      body.amount,
          status:      "SUBMITTED",
          correctionOfId: body.correctionOfId,
          ...(body.attachmentIds?.length
            ? { attachments: { connect: body.attachmentIds.map((id) => ({ id })) } }
            : {}),
        },
        include: {
          department:  { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true, email: true } },
          attachments: true,
          payments:    true,
        },
      });
    });

    // Notification email compta + in-app (best-effort)
    notifyAccountingNewRequest(churchId, req).catch(() => {});

    return successResponse(req, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
