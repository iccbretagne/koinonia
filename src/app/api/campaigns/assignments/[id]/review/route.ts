import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentManager } from "@/modules/campaigns/auth";
import { reviewAssignment } from "@/modules/campaigns";
import { limitMutation, readJson } from "../../_shared";
import { reviewSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireAssignmentManager(id);
    limitMutation(request, access);
    const input = reviewSchema.parse(await readJson(request));
    return successResponse(await reviewAssignment(access, input));
  } catch (error) {
    return errorResponse(error);
  }
}
