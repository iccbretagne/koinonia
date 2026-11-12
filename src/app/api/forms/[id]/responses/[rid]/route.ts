import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireFormManage } from "@/modules/forms/auth";
import { cancelResponse } from "@/modules/forms";
import { responseStatusSchema } from "./contract";

type Params = { params: Promise<{ id: string; rid: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, rid } = await params;
    const { session, churchId } = await requireFormManage(id);
    responseStatusSchema.parse(await request.json());
    // La réponse doit appartenir à ce formulaire (l'église a été vérifiée par le formulaire).
    const response = await cancelResponse(rid, { formId: id });
    await logAudit({ userId: session.user.id, churchId, action: "UPDATE", entityType: "FormResponse", entityId: rid, details: { formId: id, status: "CANCELLED" } });
    return successResponse(response);
  } catch (error) {
    return errorResponse(error);
  }
}
