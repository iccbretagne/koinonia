import { resolveChurchId } from "@/lib/auth";
import { errorResponse } from "@/lib/api-utils";
import { getChurchLogo } from "@/modules/core";
import { exportApplicationPdf } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("servingApplication", id);
    const actor = await requireServingActor(churchId);
    const { pdf, filename } = await exportApplicationPdf(actor, id, await getChurchLogo(churchId, "light"));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
