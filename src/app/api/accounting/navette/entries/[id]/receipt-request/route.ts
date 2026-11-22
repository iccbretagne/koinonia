import { errorResponse, successResponse } from "@/lib/api-utils";
import { cancelReceiptRequest, requestReceipt } from "@/modules/shuttle";
import { actorOf, entryAccess } from "../../../_shared";
import { receiptRequestSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await entryAccess(id, true);
    const { note } = receiptRequestSchema.parse(await request.json().catch(() => ({})));
    const entry = await requestReceipt(id, note, actorOf(access));
    return successResponse({ id: entry.id, receiptRequestCount: entry.receiptRequestCount });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await entryAccess(id, true);
    await cancelReceiptRequest(id, actorOf(access));
    return successResponse({ id });
  } catch (error) {
    return errorResponse(error);
  }
}
