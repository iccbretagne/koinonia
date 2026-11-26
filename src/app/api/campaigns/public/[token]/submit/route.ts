import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireTokenAccess } from "@/modules/campaigns/auth";
import { submitAssignment } from "@/modules/campaigns";
import { limitPublic } from "../../../assignments/_shared";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    limitPublic(request, "write");
    const { token } = await params;
    return successResponse(await submitAssignment(await requireTokenAccess(token)));
  } catch (error) {
    return errorResponse(error);
  }
}
