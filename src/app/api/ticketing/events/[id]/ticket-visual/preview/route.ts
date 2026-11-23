import { ApiError, errorResponse } from "@/lib/api-utils";
import { requireRateLimit } from "@/lib/rate-limit";
import { getTicketVisual, previewTicketVisual } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { previewSchema, previewQuery } from "./contract";
type Params = { params: Promise<{ id: string }> };
const png = (buffer: Buffer) => new Response(new Uint8Array(buffer), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "read");
    requireRateLimit(request, { prefix: `ticket-preview:${session.user.id}`, max: 60, windowMs: 60_000 });
    const visual = await getTicketVisual(id);
    const doc = visual.draft ?? visual.published;
    if (!doc) throw new ApiError(404, "Aucun visuel de billet");
    const query = previewQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    return png(await previewTicketVisual(id, doc, Number(query.profile), query.category === "child"));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    requireRateLimit(request, { prefix: `ticket-preview:${session.user.id}`, max: 60, windowMs: 60_000 });
    const query = previewQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    return png(await previewTicketVisual(id, previewSchema.parse(await request.json()), Number(query.profile), query.category === "child"));
  } catch (error) { return errorResponse(error); }
}
