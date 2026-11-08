import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getJustification, recordReturn, reviewJustification, submitJustification, waiveJustification } from "@/modules/accounting";
import { resolveTreasuryAccount } from "../../_treasury";
import { requireJustificationViewer } from "../_viewer";
import { justificationActionSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const viewer = await requireJustificationViewer();
    const { id } = await params;
    return successResponse(await getJustification(id, viewer));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const viewer = await requireJustificationViewer();
    const { id } = await params;
    const body = justificationActionSchema.parse(await request.json());
    if (body.action !== "submit" && !viewer.manage) throw new ApiError(403, "Accès refusé");
    switch (body.action) {
      case "submit":
        return successResponse(await submitJustification(id, viewer, body));
      case "accept":
        return successResponse(await reviewJustification(id, viewer, { accept: true }));
      case "reject":
        return successResponse(await reviewJustification(id, viewer, { accept: false, reason: body.reason }));
      case "waive":
        return successResponse(await waiveJustification(id, viewer, body));
      case "return": {
        const returnedAt = new Date(body.returnedAt);
        const treasuryAccountId = await resolveTreasuryAccount(viewer.churchId, body.treasuryAccountId, returnedAt);
        return successResponse(await recordReturn(id, viewer, { returnedAt, treasuryAccountId }));
      }
    }
  } catch (error) {
    return errorResponse(error);
  }
}
