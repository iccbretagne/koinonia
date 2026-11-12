import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireFormManage } from "@/modules/forms/auth";
import { duplicateForm } from "@/modules/forms";
import { formDuplicateSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, churchId } = await requireFormManage(id);
    const { title } = formDuplicateSchema.parse(await request.json().catch(() => ({})));
    const copy = await duplicateForm(id, session.user.id, title);
    await logAudit({ userId: session.user.id, churchId, action: "CREATE", entityType: "Form", entityId: copy.id, details: { duplicatedFrom: id } });
    return successResponse(copy, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
