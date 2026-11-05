import { errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { buildTreasuryExport } from "@/modules/treasury";
import { periodQuerySchema } from "@/modules/treasury/schemas";
import { currentTreasury, queryOf } from "../_shared";

export async function GET(request: Request) {
  try {
    const { churchId, session } = await currentTreasury();
    const { from, to } = queryOf(request, periodQuerySchema);
    const zip = await buildTreasuryExport(churchId, from, to);
    await logAudit({
      userId: session.user.id!,
      churchId,
      action: "EXPORT",
      entityType: "TreasuryLedger",
      entityId: churchId,
      details: { from: from ?? null, to: to ?? null },
    });
    const name = `tresorerie_${from ?? "debut"}_${to ?? new Date().toISOString().slice(0, 10)}.zip`;
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
