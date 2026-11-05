import { ApiError, errorResponse } from "@/lib/api-utils";
import { getEntryChurchId, loadTreasuryEntry, readReceipt } from "@/modules/treasury";
import { treasuryOf } from "../../../_shared";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await treasuryOf(await getEntryChurchId(id), "Ligne introuvable");
    const entry = await loadTreasuryEntry(id);
    if (!entry.receiptKey) throw new ApiError(404, "Aucun justificatif");
    const bytes = await readReceipt(entry.receiptKey);
    if (!bytes) throw new ApiError(404, "Justificatif introuvable");
    const name = encodeURIComponent(entry.receiptName ?? "justificatif");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": entry.receiptMime ?? "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${name}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
