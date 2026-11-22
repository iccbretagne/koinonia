import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireFormsCapability } from "@/modules/forms/auth";
import { createForm, listForms } from "@/modules/forms";
import { formCreateSchema } from "./contract";

export async function GET() {
  try {
    const { session, churchId, capability } = await requireFormsCapability();
    return successResponse(await listForms(churchId, capability === "own" ? { userId: session.user.id } : undefined));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, churchId } = await requireFormsCapability();
    const data = formCreateSchema.parse(await request.json());
    const form = await createForm(churchId, session.user.id, data);
    await logAudit({ userId: session.user.id, churchId, action: "CREATE", entityType: "Form", entityId: form.id, details: { title: form.title, kind: form.kind } });
    return successResponse(form, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
