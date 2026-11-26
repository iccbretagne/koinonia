import { ApiError, successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentAccess } from "@/modules/campaigns/auth";
import { deleteCampaignFile, getFileAssignmentId, readCampaignFile } from "@/modules/campaigns";
import { fileResponse, limitMutation } from "../../assignments/_shared";

type Params = { params: Promise<{ fileId: string }> };

/** Droits revérifiés à chaque appel, sur l'affectation du fichier ; inconnu ou hors droits : 404. */
async function access(fileId: string) {
  const assignmentId = await getFileAssignmentId(fileId);
  if (!assignmentId) throw new ApiError(404, "Fichier introuvable");
  return requireAssignmentAccess(assignmentId);
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { fileId } = await params;
    return fileResponse(await readCampaignFile(await access(fileId), fileId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { fileId } = await params;
    const a = await access(fileId);
    limitMutation(request, a);
    return successResponse(await deleteCampaignFile(a, fileId));
  } catch (error) {
    return errorResponse(error);
  }
}
