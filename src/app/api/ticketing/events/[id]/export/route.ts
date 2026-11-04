import { errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { buildTicketingExport } from "@/modules/ticketing";
import { requireEventAction, type EventAction } from "@/modules/ticketing/auth";
import { xlsxResponse } from "../../../_shared";
import { exportQuerySchema } from "./contract";

const ACTION: Record<string, EventAction> = {
  participants: "configure",
  options: "configure",
  payments: "payments",
  refunds: "payments",
  passages: "reception",
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { type } = exportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { session, access } = await requireEventAction(id, ACTION[type]);
    const buffer = await buildTicketingExport(id, type);
    await logAudit({ userId: session.user.id, churchId: access.churchId, action: "EXPORT", entityType: "TicketingEvent", entityId: id, details: { type } });
    return xlsxResponse(buffer, `billetterie_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (error) {
    return errorResponse(error);
  }
}
