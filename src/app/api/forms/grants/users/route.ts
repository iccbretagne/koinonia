import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireFormsGrantAdmin } from "@/modules/forms/auth";
import { searchChurchUsersForFormsGrant } from "@/modules/forms";
import { usersQuerySchema } from "./contract";

export async function GET(request: Request) {
  try {
    const { churchId } = await requireFormsGrantAdmin();
    const { q } = usersQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return successResponse(await searchChurchUsersForFormsGrant(churchId, q));
  } catch (error) {
    return errorResponse(error);
  }
}
