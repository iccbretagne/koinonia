import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireFormsGrantAdmin } from "@/modules/forms/auth";
import { grantFormsAccess, listFormsGrants } from "@/modules/forms";
import { grantSchema } from "./contract";

export async function GET() {
  try {
    const { churchId } = await requireFormsGrantAdmin();
    return successResponse(await listFormsGrants(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, churchId } = await requireFormsGrantAdmin();
    const { userId } = grantSchema.parse(await request.json());
    return successResponse(await grantFormsAccess(churchId, session.user.id, userId), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
