import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireTokenAccess } from "@/modules/campaigns/auth";
import { storeCampaignFile } from "@/modules/campaigns";
import { limitPublic, readUpload } from "../../../assignments/_shared";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    limitPublic(request, "write");
    const { token } = await params;
    const access = await requireTokenAccess(token);
    const { requestCode, file } = await readUpload(request);
    return successResponse(await storeCampaignFile(access, requestCode, file), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
