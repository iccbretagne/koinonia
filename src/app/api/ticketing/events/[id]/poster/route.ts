import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { readPoster, removePoster, setPoster } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireEventAction(id, "read");
    const poster = await readPoster(id, false);
    if (!poster) throw new ApiError(404, "Aucune affiche");
    return new Response(new Uint8Array(poster.buffer), { headers: { "Content-Type": poster.mime, "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > 3 * 1024 * 1024) throw new ApiError(413, "Affiche trop lourde (3 Mo au plus)");
    await setPoster(id, session.user.id, Buffer.from(await request.arrayBuffer()));
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    await removePoster(id, session.user.id);
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
