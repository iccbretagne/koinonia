import { errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { buildShuttleExport } from "@/modules/shuttle";
import { ledgerQuerySchema } from "@/modules/shuttle/schemas";
import { currentChurchAccess } from "../_shared";

export async function GET(request: Request) {
  try {
    const { churchId, session } = await currentChurchAccess(true);
    const { from, to } = ledgerQuerySchema.pick({ from: true, to: true }).parse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    const zip = await buildShuttleExport(churchId, { from, to });
    await logAudit({
      userId: session.user.id!,
      churchId,
      action: "EXPORT",
      entityType: "ShuttleLedger",
      entityId: churchId,
      details: { from: from ?? null, to: to ?? null },
    });
    const name = `navette_${from ?? "debut"}_${to ?? new Date().toISOString().slice(0, 10)}.zip`;
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
