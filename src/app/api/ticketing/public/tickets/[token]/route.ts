import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { getTicket } from "@/modules/ticketing";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    requireRateLimit(request, { prefix: `ticketing-ticket:${getClientIp(request)}`, windowMs: 60_000, max: 60 });
    const { token } = await params;
    return successResponse(await getTicket(token));
  } catch (error) {
    return errorResponse(error);
  }
}
