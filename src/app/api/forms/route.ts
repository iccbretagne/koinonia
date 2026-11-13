import { requireCurrentChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { createForm, listForms } from "@/modules/forms";
import { formCreateSchema } from "./contract";

export async function GET() {
  try {
    const { churchId } = await requireCurrentChurchPermission("forms:manage");
    return successResponse(await listForms(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, churchId } = await requireCurrentChurchPermission("forms:manage");
    const data = formCreateSchema.parse(await request.json());
    const form = await createForm(churchId, session.user.id, data);
    await logAudit({ userId: session.user.id, churchId, action: "CREATE", entityType: "Form", entityId: form.id, details: { title: form.title, kind: form.kind } });
    return successResponse(form, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
