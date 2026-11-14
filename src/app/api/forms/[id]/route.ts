import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireFormManage } from "@/modules/forms/auth";
import { deleteForm, getForm, updateForm, usageCounts } from "@/modules/forms";
import { formUpdateSchema } from "./contract";
import { assertLinkableEvents } from "../_events";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireFormManage(id);
    const form = await getForm(id);
    if (!form) throw new ApiError(404, "Formulaire introuvable");
    const usage = await usageCounts(id);
    return successResponse({
      ...form,
      usage: {
        responses: usage.responses,
        answeredQuestions: [...usage.answeredQuestions],
        holdingByChoice: Object.fromEntries(usage.holdingByChoice),
        holdingByLevel: Object.fromEntries(usage.holdingByLevel),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, churchId } = await requireFormManage(id);
    const data = formUpdateSchema.parse(await request.json());
    await assertLinkableEvents(churchId, data);
    const form = await updateForm(id, data);
    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "Form",
      entityId: id,
      details: {
        fields: Object.keys(data),
        questions: data.questions?.length,
        ...(data.eventId !== undefined ? { eventId: data.eventId } : {}),
        ...(data.ticketingEventId !== undefined ? { ticketingEventId: data.ticketingEventId } : {}),
      },
    });
    return successResponse(form);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, churchId } = await requireFormManage(id);
    await deleteForm(id);
    await logAudit({ userId: session.user.id, churchId, action: "DELETE", entityType: "Form", entityId: id });
    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
