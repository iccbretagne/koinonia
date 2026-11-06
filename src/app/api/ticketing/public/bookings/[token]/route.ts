import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireRateLimit, getClientIp, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { bookingIdFromManageToken, getBookingView, patchBooking } from "@/modules/ticketing";
import { readJson } from "../../../_shared";
import { bookingPatchSchema } from "./contract";

type Params = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    requireRateLimit(request, { prefix: `ticketing-manage:${getClientIp(request)}`, windowMs: 60_000, max: 60 });
    const { token } = await params;
    return successResponse(await getBookingView(await bookingIdFromManageToken(token)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    requireRateLimit(request, { prefix: `ticketing-manage-mut:${getClientIp(request)}`, ...RATE_LIMIT_MUTATION });
    const { token } = await params;
    const bookingId = await bookingIdFromManageToken(token);
    const data = bookingPatchSchema.parse(await readJson(request));
    const result = await patchBooking(bookingId, data);
    return successResponse({ message: result.message });
  } catch (error) {
    return errorResponse(error);
  }
}
