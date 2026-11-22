import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { loadShuttleEntry, readReceipt, submitRequestedReceipt } from "@/modules/shuttle";
import { actorOf, entryAccess } from "../../../_shared";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await entryAccess(id);
    const entry = await loadShuttleEntry(id);
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

/** Dépôt du justificatif demandé (spec 086) : l'auteur de la ligne seul, hors délai de 48 h. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await entryAccess(id);
    const length = request.headers.get("content-length");
    if (!length) throw new ApiError(411, "Longueur du corps requise");
    if (Number(length) > 11 * 1024 * 1024) throw new ApiError(413, "Le justificatif dépasse 10 Mo.");
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Justificatif manquant");
    return successResponse(await submitRequestedReceipt(id, file, actorOf(access)), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
