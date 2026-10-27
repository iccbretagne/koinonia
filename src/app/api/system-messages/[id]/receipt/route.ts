import { errorResponse } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { messageViewerFromSession, recordReceipt } from "@/modules/messages";
import { receiptSchema } from "./contract";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    const { action } = receiptSchema.parse(await request.json());
    await recordReceipt(id, messageViewerFromSession(session), action);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
