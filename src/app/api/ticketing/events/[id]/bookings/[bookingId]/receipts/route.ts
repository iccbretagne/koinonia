import { successResponse, errorResponse } from "@/lib/api-utils";
import { recordReceipt } from "@/modules/ticketing";
import { canDo, requireEventAction } from "@/modules/ticketing/auth";
import { receiptSchema } from "./contract";

type Params = { params: Promise<{ id: string; bookingId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, bookingId } = await params;
    const { session, access } = await requireEventAction(id, "read");
    let scope: "all" | "entry" | "pickup";
    if (canDo(access, "payments")) scope = "all";
    else if (access.roles.has("RECEPTION")) scope = "entry";
    else if (access.roles.has("CATERING")) scope = "pickup";
    else throw new Error("FORBIDDEN");
    const data = receiptSchema.parse(await request.json());
    return successResponse(await recordReceipt(id, bookingId, data, session.user.id, scope), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
