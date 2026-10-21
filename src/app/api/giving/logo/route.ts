import { Readable } from "node:stream";
import { requireChurchPermission } from "@/lib/auth";
import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { getGivingLogoStream, LOGO_MAX_BYTES, setGivingLogo } from "@/modules/giving";

/** Fichier de 2 Mo plus l'enveloppe multipart. */
const MAX_BODY_BYTES = 2.5 * 1024 * 1024;

function churchIdFrom(request: Request): string {
  const churchId = new URL(request.url).searchParams.get("churchId");
  if (!churchId) throw new ApiError(400, "churchId requis");
  return churchId;
}

function actorOf(session: { user: { id?: string; name?: string | null; email?: string | null } }) {
  return { id: session.user.id!, name: session.user.name ?? session.user.email ?? "Un utilisateur" };
}

export async function POST(request: Request) {
  try {
    // Taille bornée avant toute lecture du corps.
    const length = request.headers.get("content-length");
    if (!length) throw new ApiError(411, "Longueur du fichier requise");
    if (Number(length) > MAX_BODY_BYTES) throw new ApiError(413, "Le logo dépasse 2 Mo.");

    const form = await request.formData();
    const churchId = form.get("churchId");
    if (typeof churchId !== "string" || !churchId) throw new ApiError(400, "churchId requis");
    const session = await requireChurchPermission("giving:manage", churchId);
    requireRateLimit(request, { prefix: `giving:logo:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Fichier manquant");
    if (file.size > LOGO_MAX_BYTES) throw new ApiError(400, "Le logo dépasse 2 Mo.");

    const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    const logoVersion = await setGivingLogo(churchId, buffer, actorOf(session));
    return successResponse({ logoVersion }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const churchId = churchIdFrom(request);
    const session = await requireChurchPermission("giving:manage", churchId);
    requireRateLimit(request, { prefix: `giving:logo:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    return successResponse({ logoVersion: await setGivingLogo(churchId, null, actorOf(session)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const churchId = churchIdFrom(request);
    await requireChurchPermission("giving:manage", churchId);
    const stream = await getGivingLogoStream(churchId);
    if (!stream) throw new ApiError(404, "Aucun logo");
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
