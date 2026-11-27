import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireTokenAccess } from "@/modules/campaigns/auth";
import { getAssignmentView } from "@/modules/campaigns";
import { limitPublic } from "../../assignments/_shared";

type Params = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    limitPublic(request, "read");
    const { token } = await params;
    return successResponse(await getAssignmentView(await requireTokenAccess(token)));
  } catch (error) {
    return errorResponse(error);
  }
}
