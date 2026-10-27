import { requireChurchAccess, requireChurchPermission } from "@/lib/auth";
import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { getChurchLogo, removeChurchLogo, setChurchLogo } from "@/modules/core";
import { CHURCH_LOGO_MAX_BYTES, churchLogoVariantSchema } from "@/modules/core/schemas";
import { variantQuery } from "./contract";

/** Fichier de 2 Mo plus l'enveloppe multipart. */
const MAX_BODY_BYTES = 2.5 * 1024 * 1024;

type Params = { params: Promise<{ churchId: string }> };

function variantFrom(request: Request) {
  return variantQuery.parse({ variant: new URL(request.url).searchParams.get("variant") }).variant;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { churchId } = await params;
    await requireChurchAccess(churchId);
    const logo = await getChurchLogo(churchId, variantFrom(request));
    if (!logo) throw new ApiError(404, "Aucun logo");
    return new Response(new Uint8Array(logo), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { churchId } = await params;
    const session = await requireChurchPermission("church:settings", churchId);
    requireRateLimit(request, { prefix: `church-logo:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    // Taille bornée avant toute lecture du corps.
    const length = request.headers.get("content-length");
    if (!length) throw new ApiError(411, "Longueur du fichier requise");
    if (Number(length) > MAX_BODY_BYTES) throw new ApiError(413, "Le logo dépasse 2 Mo.");

    const form = await request.formData();
    const variant = churchLogoVariantSchema.parse(form.get("variant"));
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ApiError(400, "Fichier manquant");
    if (file.size > CHURCH_LOGO_MAX_BYTES) throw new ApiError(400, "Le logo dépasse 2 Mo.");

    const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    const version = await setChurchLogo(churchId, variant, buffer, { id: session.user.id! });
    return successResponse({ version }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { churchId } = await params;
    const session = await requireChurchPermission("church:settings", churchId);
    requireRateLimit(request, { prefix: `church-logo:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    await removeChurchLogo(churchId, variantFrom(request), { id: session.user.id! });
    return successResponse({ version: null });
  } catch (error) {
    return errorResponse(error);
  }
}
