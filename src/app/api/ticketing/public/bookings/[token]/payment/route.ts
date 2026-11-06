import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireRateLimit, getClientIp, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
import { bookingIdFromManageToken, declarePayment } from "@/modules/ticketing";
import { readJson } from "../../../../_shared";
import { declarePaymentSchema } from "./contract";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    requireRateLimit(request, { prefix: `ticketing-pay:${getClientIp(request)}`, ...RATE_LIMIT_SENSITIVE });
    const { token } = await params;
    const bookingId = await bookingIdFromManageToken(token);
    const { method } = declarePaymentSchema.parse(await readJson(request, 1024));
    const payment = await declarePayment(bookingId, method);
    return successResponse({ id: payment.id, amount: Number(payment.amount) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
