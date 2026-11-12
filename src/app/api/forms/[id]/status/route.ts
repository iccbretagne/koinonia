import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireFormManage } from "@/modules/forms/auth";
import { changeStatus } from "@/modules/forms";
import { formStatusSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, churchId } = await requireFormManage(id);
    const { action } = formStatusSchema.parse(await request.json());
    const form = await changeStatus(id, action);
    await logAudit({ userId: session.user.id, churchId, action: "UPDATE", entityType: "Form", entityId: id, details: { status: action } });
    return successResponse(form);
  } catch (error) {
    return errorResponse(error);
  }
}
