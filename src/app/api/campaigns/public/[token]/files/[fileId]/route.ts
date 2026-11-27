import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireTokenAccess } from "@/modules/campaigns/auth";
import { deleteCampaignFile, readCampaignFile } from "@/modules/campaigns";
import { fileResponse, limitPublic } from "../../../../assignments/_shared";

type Params = { params: Promise<{ token: string; fileId: string }> };

/** Le fichier doit appartenir au questionnaire du lien : sinon 404, comme un fichier absent. */
export async function GET(request: Request, { params }: Params) {
  try {
    limitPublic(request, "read");
    const { token, fileId } = await params;
    return fileResponse(await readCampaignFile(await requireTokenAccess(token), fileId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    limitPublic(request, "write");
    const { token, fileId } = await params;
    return successResponse(await deleteCampaignFile(await requireTokenAccess(token), fileId));
  } catch (error) {
    return errorResponse(error);
  }
}
