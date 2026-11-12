import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireFormManage } from "@/modules/forms/auth";
import { listResponses } from "@/modules/forms";
import { responsesQuerySchema } from "@/modules/forms/schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireFormManage(id);
    const { status } = responsesQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return successResponse(await listResponses(id, status));
  } catch (error) {
    return errorResponse(error);
  }
}
