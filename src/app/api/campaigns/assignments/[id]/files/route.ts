import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentAccess } from "@/modules/campaigns/auth";
import { storeCampaignFile } from "@/modules/campaigns";
import { limitUpload, readUpload } from "../../_shared";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireAssignmentAccess(id);
    limitUpload(request, access);
    const { requestCode, file } = await readUpload(request);
    return successResponse(await storeCampaignFile(access, requestCode, file), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
