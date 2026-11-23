import { errorResponse } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { publicTicketVisual } from "@/modules/ticketing";
import { formatSchema } from "./contract";
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    requireRateLimit(request, { prefix: `ticket-visual:${getClientIp(request)}`, max: 30, windowMs: 60_000 });
    const { token } = await params;
    const query = new URL(request.url).searchParams;
    const format = formatSchema.parse(query.get("format") ?? "png");
    const result = await publicTicketVisual(token, format);
    return new Response(new Uint8Array(result), { headers: { "Content-Type": format === "pdf" ? "application/pdf" : "image/png", "Content-Disposition": `${query.get("download") === "1" ? "attachment" : "inline"}; filename="billet.${format}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return errorResponse(error); }
}
