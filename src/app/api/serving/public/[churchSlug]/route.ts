import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { getClientIp, requireRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { normalizePhoto, resolvePublicChurch, submitApplication } from "@/modules/serving";
import { applicationFormSchema, PHOTO_MAX_BYTES } from "@/modules/serving/schemas";

/** Photo de 8 Mo plus les champs texte et l'enveloppe multipart. */
const MAX_BODY_BYTES = 9 * 1024 * 1024;

/** Champs texte du formulaire, `pcncTrainings` en tableau (cases à cocher). */
function formFields(form: FormData): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && key !== "pcncTrainings") fields[key] = value;
  }
  fields.pcncTrainings = form.getAll("pcncTrainings").filter((v): v is string => typeof v === "string");
  return fields;
}

export async function POST(request: Request, { params }: { params: Promise<{ churchSlug: string }> }) {
  try {
    // Taille bornée avant toute lecture du corps.
    const length = request.headers.get("content-length");
    if (!length) throw new ApiError(411, "Longueur de la requête requise");
    if (Number(length) > MAX_BODY_BYTES) throw new ApiError(413, "La photo dépasse 8 Mo.");

    const { churchSlug } = await params;
    const church = await resolvePublicChurch(churchSlug);
    if (!church) throw new ApiError(404, "Formulaire non disponible");

    const ip = getClientIp(request);
    requireRateLimit(request, { prefix: `public-serving:${ip}`, windowMs: 60_000, max: 5 });

    const form = await request.formData();
    const fields = formFields(form);
    // Champ piège rempli : faux succès, rien n'est enregistré.
    if (typeof fields.website === "string" && fields.website.trim() !== "") {
      return successResponse({ ok: true }, 201);
    }

    const token = typeof fields.turnstileToken === "string" ? fields.turnstileToken : "";
    if (!token || !(await verifyTurnstile(token, ip))) {
      throw new ApiError(400, "Vérification anti-robots échouée. Recharge la page et réessaie.");
    }

    const { consent: _consent, website: _website, ...data } = applicationFormSchema.parse(fields);

    const photo = form.get("photo");
    if (!(photo instanceof File) || photo.size === 0) throw new ApiError(400, "La photo est requise.");
    if (photo.size > PHOTO_MAX_BYTES) throw new ApiError(400, "Photo trop lourde (8 Mo maximum).");
    const jpeg = await normalizePhoto(Buffer.from(new Uint8Array(await photo.arrayBuffer())));

    await submitApplication(church.id, church.pvsDeptIds, data, jpeg);
    return successResponse({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
