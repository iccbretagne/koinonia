import { requireChurchPermission } from "@/lib/auth";
import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { getGivingSettings, updateGivingPage } from "@/modules/giving";
import { givingPageSchema } from "./contract";

export async function GET(request: Request) {
  try {
    const churchId = new URL(request.url).searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("giving:manage", churchId);
    return successResponse(await getGivingSettings(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = givingPageSchema.parse(await request.json());
    const session = await requireChurchPermission("giving:manage", input.churchId);
    const saved = await updateGivingPage(input, {
      id: session.user.id!,
      name: session.user.name ?? session.user.email ?? "Un utilisateur",
    });
    return successResponse(saved);
  } catch (error) {
    return errorResponse(error);
  }
}
